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


const updateSchema = z.object({
  status: z.enum(["bred", "confirmed-pregnant", "kidded", "open"]),
  notes: z.string().optional(),
  expectedKiddingDate: z.string().optional(),
});

const kiddingSchema = z.object({
  birthDate: z.string().min(1, "Birth date is required"),
  kids: z.array(z.object({
    name: z.string().optional(),
    sex: z.enum(["doe", "buck"]),
    kidStatus: z.enum(["alive", "doa"]),
    birthWeight: z.coerce.number().min(0).optional().or(z.literal("")),
    notes: z.string().optional(),
  })).min(1, "Add at least one kid"),
});

type UpdateValues = z.infer<typeof updateSchema>;
type KiddingValues = z.infer<typeof kiddingSchema>;

function KidCard({ kid }: { kid: Kid }) {
  const isDoa = kid.kidStatus === "doa";
  const sexLabel = kid.sex === "doe" ? "Doe ♀" : "Buck ♂";
  const sexClass = kid.sex === "doe" ? "bg-secondary text-secondary-foreground" : "bg-muted text-muted-foreground";
  return (
    <div className={`flex items-center gap-4 p-4 rounded-xl border border-border bg-card/50 ${isDoa ? "opacity-60" : ""}`}>
      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
        <Baby className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
          <span className="font-medium text-foreground">{kid.name || "Unnamed"}</span>
          <Badge className={`${sexClass} text-xs px-2 py-0`}>{sexLabel}</Badge>
          {isDoa && <Badge className="bg-destructive/20 text-destructive text-xs px-2 py-0">DOA</Badge>}
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
  const [isAddingKids, setIsAddingKids] = useState(false);

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
      kids: [{ name: "", sex: "doe", kidStatus: "alive", birthWeight: "", notes: "" }],
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
            kidStatus: k.kidStatus,
            birthDate: new Date(data.birthDate).toISOString(),
            birthWeight: k.birthWeight !== "" && k.birthWeight !== undefined ? Number(k.birthWeight) : undefined,
            notes: k.notes || undefined,
          })),
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Kids recorded!", description: `${data.kids.length} kid(s) added successfully.` });
          setIsAddingKids(false);
          kiddingForm.reset({ birthDate: new Date().toISOString().slice(0, 10), kids: [{ name: "", sex: "doe", kidStatus: "alive", birthWeight: "", notes: "" }] });
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
          <h2 className="text-2xl font-serif font-bold text-foreground mb-2">Record Not Found</h2>
          <Button onClick={() => setLocation("/breedings")}>Return to Kiddings</Button>
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
  const liveKids = breeding.kids?.filter((k) => k.kidStatus !== "doa") ?? [];
  const doaKids = breeding.kids?.filter((k) => k.kidStatus === "doa") ?? [];

  return (
    <Layout>
      <div className="space-y-6 animate-in fade-in duration-500 max-w-3xl mx-auto">
        <div className="flex items-center justify-between gap-4">
          <Button variant="ghost" size="sm" onClick={() => setLocation("/breedings")} className="text-muted-foreground hover:text-foreground -ml-4">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Kiddings
          </Button>
          <div className="flex items-center gap-2">
            {!isEditingStatus && (
              <Button variant="outline" size="sm" onClick={() => setIsEditingStatus(true)}>
                <Edit3 className="mr-2 h-3.5 w-3.5" /> Update Status
              </Button>
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
              <CardTitle className="font-serif text-lg">Update Status</CardTitle>
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
                              <SelectItem value="kidded">Kidded</SelectItem>
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

        {breeding.status === "kidded" && (
          <Card className="border-primary/10 shadow-md">
            <CardHeader>
              <div className="flex items-center justify-between gap-4">
                <CardTitle className="font-serif flex items-center gap-2">
                  <Baby className="h-5 w-5 text-primary" />
                  Kidding Results
                  {(breeding.kids?.length ?? 0) > 0 && (
                    <span className="text-base font-normal text-muted-foreground">({breeding.kids!.length} kid{breeding.kids!.length !== 1 ? "s" : ""})</span>
                  )}
                </CardTitle>
                {(breeding.kids?.length ?? 0) > 0 && !isAddingKids && (
                  <Button variant="outline" size="sm" onClick={() => setIsAddingKids(true)}>
                    <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Kids
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {(breeding.kids?.length ?? 0) > 0 && (
                <div className="space-y-2">
                  {[...liveKids, ...doaKids].map((kid) => <KidCard key={kid.id} kid={kid} />)}
                </div>
              )}

              {((breeding.kids?.length ?? 0) === 0 || isAddingKids) && (
                <Form {...kiddingForm}>
                  <form onSubmit={kiddingForm.handleSubmit(handleRecordKidding)} className="space-y-5">
                    <FormField
                      control={kiddingForm.control}
                      name="birthDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Birth Date</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} className="bg-background/50 max-w-[220px]" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <FormLabel>Kids Born</FormLabel>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => append({ name: "", sex: "doe", kidStatus: "alive", birthWeight: "", notes: "" })}
                        >
                          <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Another
                        </Button>
                      </div>

                      {fields.map((field, idx) => (
                        <div key={field.id} className="rounded-xl border border-border bg-card/50 p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold text-foreground">Kid #{idx + 1}</span>
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
                                  <FormLabel className="text-xs">Sex</FormLabel>
                                  <Select onValueChange={f.onChange} value={f.value}>
                                    <FormControl>
                                      <SelectTrigger className="h-8 bg-background/50">
                                        <SelectValue placeholder="Select sex" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      <SelectItem value="doe">Doe (Female)</SelectItem>
                                      <SelectItem value="buck">Buck (Male)</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={kiddingForm.control}
                              name={`kids.${idx}.kidStatus`}
                              render={({ field: f }) => (
                                <FormItem>
                                  <FormLabel className="text-xs">Status</FormLabel>
                                  <Select onValueChange={f.onChange} value={f.value}>
                                    <FormControl>
                                      <SelectTrigger className="h-8 bg-background/50">
                                        <SelectValue placeholder="Select status" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      <SelectItem value="alive">Alive</SelectItem>
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
                                    <Input className="h-8 bg-background/50" placeholder="e.g. Clover" {...f} />
                                  </FormControl>
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={kiddingForm.control}
                              name={`kids.${idx}.birthWeight`}
                              render={({ field: f }) => (
                                <FormItem>
                                  <FormLabel className="text-xs">Weight (lbs, optional)</FormLabel>
                                  <FormControl>
                                    <Input className="h-8 bg-background/50" type="number" step="0.1" placeholder="e.g. 6.5" {...f} />
                                  </FormControl>
                                </FormItem>
                              )}
                            />
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="flex gap-2 pt-1">
                      <Button type="submit" disabled={addKids.isPending}>
                        {addKids.isPending ? "Saving..." : `Save ${fields.length} Kid${fields.length !== 1 ? "s" : ""}`}
                      </Button>
                      {isAddingKids && (
                        <Button type="button" variant="outline" onClick={() => setIsAddingKids(false)}>Cancel</Button>
                      )}
                    </div>
                  </form>
                </Form>
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
                  <div className="text-sm text-muted-foreground capitalize">{breeding.doe.breed} · {breeding.doe.lactationStatus}</div>
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
