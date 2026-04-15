import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { ArrowLeft, Baby, Calendar, CheckCircle2, Edit3, Heart, Milk, Plus, Trash2, XCircle } from "lucide-react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetBreedingQueryKey,
  getListBreedingsQueryKey,
  getListGoatsQueryKey,
  useAddKids,
  useGetBreeding,
  useUpdateBreeding,
} from "@workspace/api-client-react";
import type { Kid } from "@workspace/api-client-react/src/generated/api.schemas";

const statusConfig = {
  bred: { label: "Bred", icon: Heart, className: "bg-secondary text-secondary-foreground" },
  "confirmed-pregnant": { label: "Confirmed Pregnant", icon: CheckCircle2, className: "bg-chart-1 text-primary-foreground" },
  kidded: { label: "Kidded", icon: Baby, className: "bg-primary text-primary-foreground" },
  open: { label: "Open (Did Not Take)", icon: XCircle, className: "bg-destructive text-destructive-foreground" },
};

const kidSexConfig = {
  doe: { label: "Doe", className: "bg-secondary text-secondary-foreground" },
  buck: { label: "Buck", className: "bg-muted text-muted-foreground" },
  doa: { label: "DOA", className: "bg-destructive/20 text-destructive" },
};

const updateSchema = z.object({
  status: z.enum(["bred", "confirmed-pregnant", "kidded", "open"]),
  notes: z.string().optional(),
  expectedKiddingDate: z.string().optional(),
});

const kiddingSchema = z.object({
  birthDate: z.string().min(1, "Birth date is required"),
  kids: z.array(z.object({
    name: z.string().optional(),
    sex: z.enum(["doe", "buck", "doa"]),
    birthWeight: z.coerce.number().min(0).optional().or(z.literal("")),
    notes: z.string().optional(),
  })).min(1, "Add at least one kid"),
});

type UpdateValues = z.infer<typeof updateSchema>;
type KiddingValues = z.infer<typeof kiddingSchema>;

function KidCard({ kid }: { kid: Kid }) {
  const config = kidSexConfig[kid.sex];
  return (
    <div className="flex items-center gap-4 p-4 rounded-xl border border-border bg-card/50">
      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
        <Baby className="h-5 w-5" />
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="font-medium text-foreground">{kid.name || "Unnamed"}</span>
          <Badge className={`${config.className} text-xs px-2 py-0`}>{config.label}</Badge>
        </div>
        <div className="text-xs text-muted-foreground">
          {kid.birthWeight ? `${kid.birthWeight} lbs` : null}
          {kid.birthDate ? ` • Born ${new Date(kid.birthDate).toLocaleDateString()}` : null}
          {kid.notes ? ` • ${kid.notes}` : null}
        </div>
      </div>
    </div>
  );
}

export default function BreedingDetail() {
  const params = useParams();
  const id = params.id ? parseInt(params.id, 10) : 0;
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isEditingStatus, setIsEditingStatus] = useState(false);
  const [isKiddingOpen, setIsKiddingOpen] = useState(false);

  const { data: breeding, isLoading, isError } = useGetBreeding(id, {
    query: { enabled: !!id, queryKey: getGetBreedingQueryKey(id) },
  });

  const updateBreeding = useUpdateBreeding();
  const addKids = useAddKids();

  const updateForm = useForm<UpdateValues>({
    resolver: zodResolver(updateSchema),
    values: breeding ? {
      status: breeding.status,
      notes: breeding.notes ?? "",
      expectedKiddingDate: breeding.expectedKiddingDate ? new Date(breeding.expectedKiddingDate).toISOString().slice(0, 10) : "",
    } : undefined,
  });

  const kiddingForm = useForm<KiddingValues>({
    resolver: zodResolver(kiddingSchema),
    defaultValues: {
      birthDate: new Date().toISOString().slice(0, 10),
      kids: [{ name: "", sex: "doe", birthWeight: "", notes: "" }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control: kiddingForm.control, name: "kids" });

  const handleUpdateStatus = (data: UpdateValues) => {
    updateBreeding.mutate(
      {
        id,
        data: {
          status: data.status,
          notes: data.notes,
          expectedKiddingDate: data.expectedKiddingDate ? new Date(data.expectedKiddingDate).toISOString() : undefined,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Record updated" });
          setIsEditingStatus(false);
          queryClient.invalidateQueries({ queryKey: getGetBreedingQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getListBreedingsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListGoatsQueryKey() });
        },
        onError: () => toast({ title: "Update failed", variant: "destructive" }),
      }
    );
  };

  const handleRecordKidding = (data: KiddingValues) => {
    addKids.mutate(
      {
        id,
        data: {
          birthDate: new Date(data.birthDate).toISOString(),
          kids: data.kids.map((k) => ({
            name: k.name || undefined,
            sex: k.sex,
            birthDate: new Date(data.birthDate).toISOString(),
            birthWeight: k.birthWeight !== "" && k.birthWeight !== undefined ? Number(k.birthWeight) : undefined,
            notes: k.notes || undefined,
          })),
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Kidding recorded!", description: `${data.kids.length} kid(s) recorded successfully.` });
          setIsKiddingOpen(false);
          kiddingForm.reset({ birthDate: new Date().toISOString().slice(0, 10), kids: [{ name: "", sex: "doe", birthWeight: "", notes: "" }] });
          queryClient.invalidateQueries({ queryKey: getGetBreedingQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getListBreedingsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListGoatsQueryKey() });
        },
        onError: () => toast({ title: "Failed to record kidding", variant: "destructive" }),
      }
    );
  };

  if (isError) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <h2 className="text-2xl font-serif font-bold text-foreground mb-2">Breeding Not Found</h2>
          <Button onClick={() => setLocation("/breedings")}>Return to Breedings</Button>
        </div>
      </Layout>
    );
  }

  if (isLoading || !breeding) {
    return (
      <Layout>
        <div className="space-y-6">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-48 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </Layout>
    );
  }

  const config = statusConfig[breeding.status];
  const StatusIcon = config.icon;
  const liveKids = breeding.kids?.filter((k) => k.sex !== "doa") ?? [];
  const doaKids = breeding.kids?.filter((k) => k.sex === "doa") ?? [];

  return (
    <Layout>
      <div className="space-y-6 animate-in fade-in duration-500 max-w-3xl mx-auto">
        <div className="flex items-center justify-between gap-4">
          <Button variant="ghost" size="sm" onClick={() => setLocation("/breedings")} className="text-muted-foreground hover:text-foreground -ml-4">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Breedings
          </Button>
          <div className="flex items-center gap-2">
            {!isEditingStatus && breeding.status !== "kidded" && (
              <Button variant="outline" size="sm" onClick={() => setIsEditingStatus(true)}>
                <Edit3 className="mr-2 h-3.5 w-3.5" /> Update Status
              </Button>
            )}
            {breeding.status !== "kidded" && breeding.status !== "open" && (
              <Dialog open={isKiddingOpen} onOpenChange={setIsKiddingOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="shadow-sm">
                    <Baby className="mr-2 h-3.5 w-3.5" /> Record Kidding
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className="font-serif">Record Kidding</DialogTitle>
                    <DialogDescription>
                      Enter the birth date and details for each kid born. Add a row per kid.
                    </DialogDescription>
                  </DialogHeader>

                  <Form {...kiddingForm}>
                    <form onSubmit={kiddingForm.handleSubmit(handleRecordKidding)} className="space-y-6">
                      <FormField
                        control={kiddingForm.control}
                        name="birthDate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Birth Date</FormLabel>
                            <FormControl>
                              <Input type="date" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <FormLabel>Kids</FormLabel>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => append({ name: "", sex: "doe", birthWeight: "", notes: "" })}
                          >
                            <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Kid
                          </Button>
                        </div>

                        {fields.map((field, idx) => (
                          <div key={field.id} className="rounded-xl border border-border bg-card/50 p-4 space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium text-foreground">Kid #{idx + 1}</span>
                              {fields.length > 1 && (
                                <Button type="button" variant="ghost" size="sm" onClick={() => remove(idx)} className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <FormField
                                control={kiddingForm.control}
                                name={`kids.${idx}.sex`}
                                render={({ field: f }) => (
                                  <FormItem>
                                    <FormLabel className="text-xs">Outcome</FormLabel>
                                    <Select onValueChange={f.onChange} value={f.value}>
                                      <FormControl>
                                        <SelectTrigger className="h-8">
                                          <SelectValue />
                                        </SelectTrigger>
                                      </FormControl>
                                      <SelectContent>
                                        <SelectItem value="doe">Doe (female)</SelectItem>
                                        <SelectItem value="buck">Buck (male)</SelectItem>
                                        <SelectItem value="doa">DOA</SelectItem>
                                      </SelectContent>
                                    </Select>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                              <FormField
                                control={kiddingForm.control}
                                name={`kids.${idx}.name`}
                                render={({ field: f }) => (
                                  <FormItem>
                                    <FormLabel className="text-xs">Name (optional)</FormLabel>
                                    <FormControl>
                                      <Input className="h-8" placeholder="e.g. Clover" {...f} />
                                    </FormControl>
                                  </FormItem>
                                )}
                              />
                              <FormField
                                control={kiddingForm.control}
                                name={`kids.${idx}.birthWeight`}
                                render={({ field: f }) => (
                                  <FormItem>
                                    <FormLabel className="text-xs">Weight (lbs)</FormLabel>
                                    <FormControl>
                                      <Input className="h-8" type="number" step="0.1" placeholder="e.g. 6.5" {...f} />
                                    </FormControl>
                                  </FormItem>
                                )}
                              />
                              <FormField
                                control={kiddingForm.control}
                                name={`kids.${idx}.notes`}
                                render={({ field: f }) => (
                                  <FormItem>
                                    <FormLabel className="text-xs">Notes</FormLabel>
                                    <FormControl>
                                      <Input className="h-8" placeholder="Any observations" {...f} />
                                    </FormControl>
                                  </FormItem>
                                )}
                              />
                            </div>
                          </div>
                        ))}
                      </div>

                      <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setIsKiddingOpen(false)}>Cancel</Button>
                        <Button type="submit" disabled={addKids.isPending}>
                          {addKids.isPending ? "Saving..." : `Record ${fields.length} Kid${fields.length !== 1 ? "s" : ""}`}
                        </Button>
                      </DialogFooter>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>

        <Card className="border-primary/10 shadow-md">
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="font-serif text-2xl">{breeding.doe?.name ?? `Doe #${breeding.doeId}`}</CardTitle>
                <p className="text-muted-foreground mt-1">× <span className="font-medium text-foreground">{breeding.sireName}</span></p>
              </div>
              <Badge className={`${config.className} flex items-center gap-1.5 px-3 py-1.5 text-sm`}>
                <StatusIcon className="h-3.5 w-3.5" />
                {config.label}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-xl border border-border bg-card/50 p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1.5"><Calendar className="h-3 w-3" /> Breeding Date</div>
                <div className="font-medium text-foreground">{new Date(breeding.breedingDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</div>
              </div>
              {breeding.expectedKiddingDate && (
                <div className="rounded-xl border border-border bg-card/50 p-4">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1.5"><Baby className="h-3 w-3" /> Expected Kidding</div>
                  <div className="font-medium text-foreground">{new Date(breeding.expectedKiddingDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</div>
                </div>
              )}
              {breeding.doe?.breed && (
                <div className="rounded-xl border border-border bg-card/50 p-4">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1.5"><Milk className="h-3 w-3" /> Doe Breed</div>
                  <div className="font-medium text-foreground capitalize">{breeding.doe.breed}</div>
                </div>
              )}
              {breeding.doe && (
                <div className="rounded-xl border border-border bg-card/50 p-4">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Doe Health</div>
                  <div className="font-medium text-foreground capitalize">{breeding.doe.status}</div>
                </div>
              )}
            </div>

            {breeding.notes && (
              <div className="rounded-xl border border-border bg-card/50 p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Notes</div>
                <p className="text-sm text-foreground leading-relaxed">{breeding.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {isEditingStatus && (
          <Card className="border-primary/10 shadow-md">
            <CardHeader>
              <CardTitle className="font-serif text-lg">Update Breeding Status</CardTitle>
            </CardHeader>
            <CardContent>
              <Form {...updateForm}>
                <form onSubmit={updateForm.handleSubmit(handleUpdateStatus)} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField
                      control={updateForm.control}
                      name="status"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Status</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger className="bg-background/50">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="bred">Bred</SelectItem>
                              <SelectItem value="confirmed-pregnant">Confirmed Pregnant</SelectItem>
                              <SelectItem value="open">Open (Did Not Take)</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={updateForm.control}
                      name="expectedKiddingDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Expected Kidding Date</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} className="bg-background/50" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={updateForm.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Notes</FormLabel>
                        <FormControl>
                          <Textarea className="bg-background/50 resize-none" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="flex gap-2">
                    <Button type="submit" disabled={updateBreeding.isPending}>
                      {updateBreeding.isPending ? "Saving..." : "Save Changes"}
                    </Button>
                    <Button type="button" variant="outline" onClick={() => setIsEditingStatus(false)}>Cancel</Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        )}

        {(breeding.kids?.length ?? 0) > 0 && (
          <Card className="border-primary/10 shadow-md">
            <CardHeader>
              <CardTitle className="font-serif flex items-center gap-2">
                <Baby className="h-5 w-5 text-primary" />
                Litter ({breeding.kids!.length} kid{breeding.kids!.length !== 1 ? "s" : ""})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {liveKids.length > 0 && (
                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-3">Live Kids ({liveKids.length})</div>
                  <div className="space-y-2">
                    {liveKids.map((kid) => <KidCard key={kid.id} kid={kid} />)}
                  </div>
                </div>
              )}
              {doaKids.length > 0 && (
                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-3">DOA ({doaKids.length})</div>
                  <div className="space-y-2">
                    {doaKids.map((kid) => <KidCard key={kid.id} kid={kid} />)}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {breeding.doe && (
          <Card className="border-primary/10 shadow-md">
            <CardHeader>
              <CardTitle className="font-serif text-lg">Doe Record</CardTitle>
            </CardHeader>
            <CardContent>
              <a href={`/goats/${breeding.doe.id}`} className="flex items-center gap-4 p-3 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
                  <Milk className="h-4 w-4" />
                </div>
                <div className="flex-1">
                  <div className="font-medium text-foreground">{breeding.doe.name}</div>
                  <div className="text-sm text-muted-foreground capitalize">{breeding.doe.breed} · {breeding.doe.status} · {breeding.doe.lactationStatus}</div>
                </div>
                <ArrowLeft className="h-4 w-4 rotate-180 text-muted-foreground" />
              </a>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
