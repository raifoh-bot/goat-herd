import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Plus, Snowflake, Pencil, Trash2, Package, Upload } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListSemenStrawsQueryKey,
  useListSemenStraws,
  useCreateSemenStraw,
  useUpdateSemenStraw,
  useDeleteSemenStraw,
} from "@workspace/api-client-react";
import type { SemenStraw } from "@workspace/api-client-react/src/generated/api.schemas";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useFarmSettings } from "@/lib/settings";
import { useIsManager } from "@/lib/auth";
import { ImportStrawsDialog } from "./import-dialog";

const strawSchema = z.object({
  sireName: z.string().min(1, "Sire / straw name is required"),
  strawId: z.string().optional(),
  supplier: z.string().optional(),
  count: z.coerce.number().int().min(0, "Count cannot be negative"),
  tankLocation: z.string().optional(),
  sireDamName: z.string().optional(),
  sireSireName: z.string().optional(),
  sirePatGranddamName: z.string().optional(),
  sirePatGrandsireName: z.string().optional(),
  notes: z.string().optional(),
});

type StrawValues = z.infer<typeof strawSchema>;

export default function InventoryList() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { usesAi, isLoading: settingsLoading } = useFarmSettings();
  const isManager = useIsManager();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<SemenStraw | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SemenStraw | null>(null);

  const { data: straws, isLoading } = useListSemenStraws({
    query: { queryKey: getListSemenStrawsQueryKey() },
  });

  const createStraw = useCreateSemenStraw();
  const updateStraw = useUpdateSemenStraw();
  const deleteStraw = useDeleteSemenStraw();

  const form = useForm<StrawValues>({
    resolver: zodResolver(strawSchema),
    defaultValues: {
      sireName: "",
      strawId: "",
      supplier: "",
      count: 0,
      tankLocation: "",
      sireDamName: "",
      sireSireName: "",
      sirePatGranddamName: "",
      sirePatGrandsireName: "",
      notes: "",
    },
  });

  // When the farm has turned AI off, the inventory has no entry points; send
  // anyone who lands here by direct URL back to the herd.
  useEffect(() => {
    if (!settingsLoading && !usesAi) {
      setLocation("/goats");
    }
  }, [settingsLoading, usesAi, setLocation]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListSemenStrawsQueryKey() });

  const totalStraws = useMemo(
    () => (straws ?? []).reduce((sum, s) => sum + s.count, 0),
    [straws]
  );

  const perSire = useMemo(() => {
    const map = new Map<string, number>();
    (straws ?? []).forEach((s) => {
      map.set(s.sireName, (map.get(s.sireName) ?? 0) + s.count);
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [straws]);

  const openAdd = () => {
    setEditing(null);
    form.reset({
      sireName: "",
      strawId: "",
      supplier: "",
      count: 0,
      tankLocation: "",
      sireDamName: "",
      sireSireName: "",
      sirePatGranddamName: "",
      sirePatGrandsireName: "",
      notes: "",
    });
    setDialogOpen(true);
  };

  const openEdit = (straw: SemenStraw) => {
    setEditing(straw);
    form.reset({
      sireName: straw.sireName,
      strawId: straw.strawId ?? "",
      supplier: straw.supplier ?? "",
      count: straw.count,
      tankLocation: straw.tankLocation ?? "",
      sireDamName: straw.sireDamName ?? "",
      sireSireName: straw.sireSireName ?? "",
      sirePatGranddamName: straw.sirePatGranddamName ?? "",
      sirePatGrandsireName: straw.sirePatGrandsireName ?? "",
      notes: straw.notes ?? "",
    });
    setDialogOpen(true);
  };

  const handleSubmit = (data: StrawValues) => {
    const payload = {
      sireName: data.sireName,
      strawId: data.strawId || undefined,
      supplier: data.supplier || undefined,
      count: data.count,
      tankLocation: data.tankLocation || undefined,
      sireDamName: data.sireDamName || undefined,
      sireSireName: data.sireSireName || undefined,
      sirePatGranddamName: data.sirePatGranddamName || undefined,
      sirePatGrandsireName: data.sirePatGrandsireName || undefined,
      notes: data.notes || undefined,
    };

    if (editing) {
      updateStraw.mutate(
        { id: editing.id, data: payload },
        {
          onSuccess: () => {
            toast({ title: "Inventory updated" });
            invalidate();
            setDialogOpen(false);
          },
          onError: () => toast({ title: "Update failed", variant: "destructive" }),
        }
      );
    } else {
      createStraw.mutate(
        { data: payload },
        {
          onSuccess: () => {
            toast({ title: "Straws added to inventory" });
            invalidate();
            setDialogOpen(false);
          },
          onError: () => toast({ title: "Save failed", variant: "destructive" }),
        }
      );
    }
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteStraw.mutate(
      { id: deleteTarget.id },
      {
        onSuccess: () => {
          toast({ title: "Inventory entry removed" });
          invalidate();
          setDeleteTarget(null);
        },
        onError: () => toast({ title: "Delete failed", variant: "destructive" }),
      }
    );
  };

  const isPending = createStraw.isPending || updateStraw.isPending;

  return (
    <Layout>
      <div className="space-y-6 animate-in fade-in duration-500">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-3xl font-serif font-bold text-foreground mb-2 flex items-center gap-2">
              <Snowflake className="h-7 w-7 text-primary" />
              AI Inventory
            </h2>
            <p className="text-muted-foreground text-sm">
              Track frozen straws in the tank and what's available per sire.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isManager && (
              <Button onClick={() => setImportOpen(true)} size="lg" variant="outline" className="shadow-sm">
                <Upload className="mr-2 h-4 w-4" /> Import CSV
              </Button>
            )}
            <Button onClick={openAdd} size="lg" className="shadow-md">
              <Plus className="mr-2 h-4 w-4" /> Add AI Straws
            </Button>
          </div>
        </div>

        {/* Remaining straws per sire */}
        {!isLoading && perSire.length > 0 && (
          <Card className="border-primary/10">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <Package className="h-4 w-4 text-primary" />
                <h3 className="font-serif font-bold text-foreground">Remaining Straws by Sire</h3>
                <Badge variant="secondary" className="ml-auto">{totalStraws} total</Badge>
              </div>
              <div className="flex flex-wrap gap-2">
                {perSire.map(([sire, count]) => (
                  <div
                    key={sire}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                      count === 0
                        ? "border-destructive/30 bg-destructive/5 text-muted-foreground"
                        : "border-primary/15 bg-primary/5"
                    }`}
                  >
                    <span className="font-medium text-foreground">{sire}</span>
                    <Badge className={count === 0 ? "bg-destructive text-destructive-foreground" : "bg-primary text-primary-foreground"}>
                      {count}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Inventory entries */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-40 rounded-xl" />
            ))}
          </div>
        ) : !straws || straws.length === 0 ? (
          <Card className="border-dashed border-primary/20">
            <CardContent className="p-12 text-center">
              <Snowflake className="h-12 w-12 text-muted-foreground/40 mx-auto mb-4" />
              <h3 className="font-serif text-lg font-bold text-foreground mb-1">No straws in inventory yet</h3>
              <p className="text-muted-foreground text-sm mb-6">
                Add your frozen AI straws to track what you have on hand.
              </p>
              <Button onClick={openAdd}>
                <Plus className="mr-2 h-4 w-4" /> Add AI Straws
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {straws.map((straw) => (
              <Card key={straw.id} className="group border-primary/10 hover:shadow-lg transition-all duration-300">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0">
                      <h3 className="font-serif text-lg font-bold text-foreground line-clamp-1">{straw.sireName}</h3>
                      {straw.strawId && (
                        <p className="text-xs text-muted-foreground">Straw ID: {straw.strawId}</p>
                      )}
                    </div>
                    <Badge
                      className={`${straw.count === 0 ? "bg-destructive text-destructive-foreground" : "bg-primary text-primary-foreground"} shrink-0`}
                    >
                      {straw.count} {straw.count === 1 ? "straw" : "straws"}
                    </Badge>
                  </div>

                  <div className="space-y-1.5 text-sm text-muted-foreground">
                    {straw.supplier && (
                      <p><span className="text-foreground/70 font-medium">Supplier:</span> {straw.supplier}</p>
                    )}
                    {straw.tankLocation && (
                      <p><span className="text-foreground/70 font-medium">Location:</span> {straw.tankLocation}</p>
                    )}
                    {straw.notes && <p className="line-clamp-2 italic">{straw.notes}</p>}
                  </div>

                  <div className="flex justify-end gap-1 mt-4 pt-3 border-t border-border/60">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(straw)}>
                      <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setDeleteTarget(straw)}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Bulk CSV import dialog */}
      <ImportStrawsDialog open={importOpen} onOpenChange={setImportOpen} onImported={invalidate} />

      {/* Add / edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Inventory Entry" : "Add AI Straws"}</DialogTitle>
            <DialogDescription>
              {editing ? "Update the details for this straw entry." : "Record frozen straws you've added to the tank."}
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField control={form.control} name="sireName" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sire</FormLabel>
                    <FormControl>
                      <Input placeholder="Buck name" {...field} className="bg-background/50" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="count" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Straw Count</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} {...field} className="bg-background/50" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="strawId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Straw / Batch ID (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="Lot or straw #" {...field} className="bg-background/50" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="supplier" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Supplier (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="Stud / supplier" {...field} className="bg-background/50" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="tankLocation" render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Tank Location (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="Canister / cane / goblet" {...field} className="bg-background/50" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <div className="rounded-lg border border-primary/15 bg-primary/5 p-4 space-y-4">
                <div>
                  <h4 className="font-serif font-bold text-foreground text-sm">Sire's Breeding Line</h4>
                  <p className="text-xs text-muted-foreground">
                    The sire's own pedigree carries through to kids born from this straw.
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField control={form.control} name="sireDamName" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Sire's Dam (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="Sire's mother" {...field} className="bg-background/50" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="sireSireName" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Sire's Sire (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="Sire's father" {...field} className="bg-background/50" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="sirePatGranddamName" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Paternal Granddam (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="Sire's sire's dam" {...field} className="bg-background/50" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="sirePatGrandsireName" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Paternal Grandsire (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="Sire's sire's sire" {...field} className="bg-background/50" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
              </div>

              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes (Optional)</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Collection date, motility, observations..." className="resize-none bg-background/50" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={isPending}>
                  {isPending ? "Saving..." : editing ? "Save Changes" : "Add to Inventory"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove inventory entry?</DialogTitle>
            <DialogDescription>
              This will permanently remove the straw entry for{" "}
              <span className="font-medium text-foreground">{deleteTarget?.sireName}</span> from your inventory.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteStraw.isPending}>
              {deleteStraw.isPending ? "Removing..." : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
