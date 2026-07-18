import { useState } from "react";
import { format } from "date-fns";
import { Container, Plus, Pencil, Trash2, ChevronDown, AlertCircle } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListSemenTanksQueryKey,
  useListSemenTanks,
  useCreateSemenTank,
  useUpdateSemenTank,
  useDeleteSemenTank,
} from "@workspace/api-client-react";
import type { SemenTank } from "@workspace/api-client-react/src/generated/api.schemas";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
import { useToast } from "@/hooks/use-toast";

const tankSchema = z.object({
  name: z.string().min(1, "Tank name is required"),
  lastServiceDate: z.string().optional(),
  notes: z.string().optional(),
});

type TankValues = z.infer<typeof tankSchema>;

type Props = {
  isManager: boolean;
  onTanksChanged: () => void;
};

export function TanksCard({ isManager, onTanksChanged }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SemenTank | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SemenTank | null>(null);

  const { data: tanks, isLoading } = useListSemenTanks({
    query: { queryKey: getListSemenTanksQueryKey() },
  });

  const createTank = useCreateSemenTank();
  const updateTank = useUpdateSemenTank();
  const deleteTank = useDeleteSemenTank();

  const form = useForm<TankValues>({
    resolver: zodResolver(tankSchema),
    defaultValues: { name: "", lastServiceDate: "", notes: "" },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListSemenTanksQueryKey() });
    onTanksChanged();
  };

  const openAdd = () => {
    setEditing(null);
    form.reset({ name: "", lastServiceDate: "", notes: "" });
    setDialogOpen(true);
  };

  const openEdit = (tank: SemenTank) => {
    setEditing(tank);
    form.reset({
      name: tank.name,
      lastServiceDate: tank.lastServiceDate ? tank.lastServiceDate.slice(0, 10) : "",
      notes: tank.notes ?? "",
    });
    setDialogOpen(true);
  };

  const handleSubmit = (data: TankValues) => {
    const payload = {
      name: data.name,
      lastServiceDate: data.lastServiceDate
        ? new Date(`${data.lastServiceDate}T00:00:00`).toISOString()
        : null,
      notes: data.notes || undefined,
    };

    if (editing) {
      updateTank.mutate(
        { id: editing.id, data: payload },
        {
          onSuccess: () => {
            toast({ title: "Tank updated" });
            invalidate();
            setDialogOpen(false);
          },
          onError: () => toast({ title: "Update failed", variant: "destructive" }),
        },
      );
    } else {
      createTank.mutate(
        { data: payload },
        {
          onSuccess: () => {
            toast({ title: "Tank added" });
            invalidate();
            setDialogOpen(false);
          },
          onError: () => toast({ title: "Save failed", variant: "destructive" }),
        },
      );
    }
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteTank.mutate(
      { id: deleteTarget.id },
      {
        onSuccess: () => {
          toast({ title: "Tank removed" });
          invalidate();
          setDeleteTarget(null);
        },
        onError: (err: unknown) => {
          const status = (err as { response?: { status?: number } })?.response?.status;
          toast({
            title: "Could not delete tank",
            description:
              status === 409
                ? "This tank still has straw entries assigned to it. Reassign them to another tank first."
                : undefined,
            variant: "destructive",
          });
          setDeleteTarget(null);
        },
      },
    );
  };

  const isPending = createTank.isPending || updateTank.isPending;
  const tankHasStraws = (deleteTarget?.strawEntryCount ?? 0) > 0;

  return (
    <Card className="border-primary/10">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CardContent className="p-5">
          <div className="flex items-center gap-2">
            <CollapsibleTrigger asChild>
              <button className="flex items-center gap-2 min-w-0 text-left" aria-label="Toggle tanks section">
                <Container className="h-4 w-4 text-primary shrink-0" />
                <h3 className="font-serif font-bold text-foreground">Tanks</h3>
                <Badge variant="secondary">{tanks?.length ?? 0}</Badge>
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
              </button>
            </CollapsibleTrigger>
            {isManager && (
              <Button variant="outline" size="sm" className="ml-auto" onClick={openAdd}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Tank
              </Button>
            )}
          </div>

          <CollapsibleContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground mt-4">Loading tanks…</p>
            ) : !tanks || tanks.length === 0 ? (
              <p className="text-sm text-muted-foreground mt-4">
                No tanks yet. Add your nitrogen tanks so each straw entry can be assigned to one.
              </p>
            ) : (
              <div className="mt-4 divide-y divide-border/60 rounded-lg border border-border/60">
                {tanks.map((tank) => (
                  <div key={tank.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="font-medium text-foreground text-sm">{tank.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {tank.lastServiceDate
                          ? `Last serviced ${format(new Date(tank.lastServiceDate), "MMM d, yyyy")}`
                          : "No service date recorded"}
                        {" · "}
                        {tank.strawEntryCount} {tank.strawEntryCount === 1 ? "straw entry" : "straw entries"}
                      </p>
                    </div>
                    {isManager && (
                      <div className="ml-auto flex gap-1 shrink-0">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(tank)} aria-label={`Edit ${tank.name}`}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeleteTarget(tank)}
                          aria-label={`Delete ${tank.name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CollapsibleContent>
        </CardContent>
      </Collapsible>

      {/* Add / edit tank dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Tank" : "Add Tank"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Update this nitrogen tank's details."
                : "Name the tank and note when it was last serviced."}
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Tank Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Barn Tank, MVE XC-20" {...field} className="bg-background/50" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="lastServiceDate" render={({ field }) => (
                <FormItem>
                  <FormLabel>Last Service Date (Optional)</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} className="bg-background/50" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes (Optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="Service provider, size..." {...field} className="bg-background/50" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={isPending}>
                  {isPending ? "Saving..." : editing ? "Save Changes" : "Add Tank"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{tankHasStraws ? "Tank still in use" : "Remove tank?"}</DialogTitle>
            <DialogDescription>
              {tankHasStraws ? (
                <span className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-destructive" />
                  <span>
                    <span className="font-medium text-foreground">{deleteTarget?.name}</span> still has{" "}
                    {deleteTarget?.strawEntryCount}{" "}
                    {deleteTarget?.strawEntryCount === 1 ? "straw entry" : "straw entries"} assigned. Reassign
                    those entries to another tank before deleting it.
                  </span>
                </span>
              ) : (
                <>
                  This will permanently remove{" "}
                  <span className="font-medium text-foreground">{deleteTarget?.name}</span> from your tanks.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              {tankHasStraws ? "Close" : "Cancel"}
            </Button>
            {!tankHasStraws && (
              <Button variant="destructive" onClick={handleDelete} disabled={deleteTank.isPending}>
                {deleteTank.isPending ? "Removing..." : "Remove"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
