import { useState, useMemo } from "react";
import { matchesHerdStatus } from "@/lib/goats";
import { useLocation } from "wouter";
import { ArrowLeft, Plus, Trash2, ChevronDown } from "lucide-react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListBreedingsQueryKey,
  getListGoatsQueryKey,
  getGetBreedingQueryKey,
  getListSemenStrawsQueryKey,
  useAddKids,
  useCreateBreeding,
  useListGoats,
  useListBreedings,
  useListSemenStraws,
} from "@workspace/api-client-react";
import { useFarmSettings, weightUnitLabel } from "@/lib/settings";

const NEW_SENTINEL = "__new__";

function SireSelect({
  value,
  onChange,
  knownSires,
}: {
  value: string;
  onChange: (v: string) => void;
  knownSires: string[];
}) {
  const isKnown = knownSires.includes(value);
  const [freeText, setFreeText] = useState(!isKnown && value !== "" ? value : "");
  const [showFreeText, setShowFreeText] = useState(!isKnown && value !== "");

  const handleSelect = (v: string) => {
    if (v === NEW_SENTINEL) {
      setShowFreeText(true);
      setFreeText("");
      onChange("");
    } else {
      setShowFreeText(false);
      onChange(v);
    }
  };

  const handleFreeTextChange = (v: string) => {
    setFreeText(v);
    onChange(v);
  };

  if (showFreeText) {
    return (
      <div className="flex gap-2 items-center">
        <Input
          value={freeText}
          onChange={(e) => handleFreeTextChange(e.target.value)}
          placeholder="Enter sire name or registration"
          className="bg-background/50 flex-1"
          autoFocus
        />
        {knownSires.length > 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 text-xs h-9 px-3"
            onClick={() => {
              setShowFreeText(false);
              onChange("");
            }}
          >
            <ChevronDown className="h-3 w-3 mr-1" />
            Pick existing
          </Button>
        )}
      </div>
    );
  }

  return (
    <Select onValueChange={handleSelect} value={value || ""}>
      <SelectTrigger className="bg-background/50">
        <SelectValue placeholder="Select a sire or add new" />
      </SelectTrigger>
      <SelectContent>
        {knownSires.map((name) => (
          <SelectItem key={name} value={name}>
            {name}
          </SelectItem>
        ))}
        <SelectItem value={NEW_SENTINEL} className="text-primary font-medium border-t border-border mt-1 pt-1">
          + Add new sire...
        </SelectItem>
      </SelectContent>
    </Select>
  );
}

function GoatNameSelect({
  value,
  onChange,
  goatNames,
}: {
  value: string;
  onChange: (v: string) => void;
  goatNames: string[];
}) {
  const isKnown = goatNames.includes(value);
  const [freeText, setFreeText] = useState(!isKnown && value !== "" ? value : "");
  const [showFreeText, setShowFreeText] = useState(!isKnown && value !== "");

  const handleSelect = (v: string) => {
    if (v === NEW_SENTINEL) {
      setShowFreeText(true);
      setFreeText("");
      onChange("");
    } else {
      setShowFreeText(false);
      onChange(v);
    }
  };

  if (showFreeText) {
    return (
      <div className="flex gap-2 items-center">
        <Input
          value={freeText}
          onChange={(e) => { setFreeText(e.target.value); onChange(e.target.value); }}
          placeholder="Enter kid's name"
          className="bg-background/50 flex-1"
          autoFocus
        />
        {goatNames.length > 0 && (
          <Button type="button" variant="outline" size="sm" className="shrink-0 text-xs h-9 px-3"
            onClick={() => { setShowFreeText(false); onChange(""); }}>
            <ChevronDown className="h-3 w-3 mr-1" />
            Pick existing
          </Button>
        )}
      </div>
    );
  }

  return (
    <Select onValueChange={handleSelect} value={value || ""}>
      <SelectTrigger className="bg-background/50">
        <SelectValue placeholder="Select or enter a name" />
      </SelectTrigger>
      <SelectContent>
        {goatNames.map((name) => (
          <SelectItem key={name} value={name}>{name}</SelectItem>
        ))}
        <SelectItem value={NEW_SENTINEL} className="text-primary font-medium border-t border-border mt-1 pt-1">
          + Add new name...
        </SelectItem>
      </SelectContent>
    </Select>
  );
}

const breedingSchema = z.object({
  doeId: z.coerce.number().int().positive("Please select a doe"),
  breedingMethod: z.enum(["natural", "ai"]),
  sireName: z.string().min(1, "Sire name is required"),
  semenSource: z.string().optional(),
  semenStrawId: z.string().optional(),
  breedingDate: z.string().min(1, "Breeding date is required"),
  expectedKiddingDate: z.string().optional(),
  notes: z.string().optional(),
});

const historicalSchema = z.object({
  doeId: z.coerce.number().int().positive("Please select a doe"),
  sireName: z.string().min(1, "Sire name is required"),
  kiddingDate: z.string().min(1, "Kidding date is required"),
  breedingDate: z.string().optional(),
  notes: z.string().optional(),
  kids: z.array(z.object({
    name: z.string().optional(),
    sex: z.enum(["doe", "buck"]),
    kidStatus: z.enum(["alive", "doa", "sold"]),
    birthWeight: z.union([z.string(), z.number()]).optional(),
  })).min(1, "At least one kid is required"),
});

type BreedingValues = z.infer<typeof breedingSchema>;
type HistoricalValues = z.infer<typeof historicalSchema>;

export default function BreedingNew() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"breeding" | "historical">("breeding");

  const createBreeding = useCreateBreeding();
  const addKids = useAddKids();

  const { data: goats } = useListGoats(
    {},
    { query: { queryKey: getListGoatsQueryKey() } }
  );

  const { data: breedings } = useListBreedings({
    query: { queryKey: getListBreedingsQueryKey() },
  });

  const { data: semenStraws } = useListSemenStraws({
    query: { queryKey: getListSemenStrawsQueryKey() },
  });

  const availableStraws = useMemo(
    () => (semenStraws ?? []).filter((s) => s.count > 0),
    [semenStraws]
  );

  const does = goats?.filter((g) => g.sex === "doe" && matchesHerdStatus(g, "on-farm")) ?? [];

  const goatNames = useMemo(() => {
    const names = new Set<string>();
    goats?.forEach((g) => { if (g.name) names.add(g.name.trim()); });
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [goats]);

  const knownSires = useMemo(() => {
    const names = new Set<string>();
    goats?.forEach((g) => {
      // Include bucks in the herd as selectable sires
      if (g.sex === "buck" && g.name) names.add(g.name.trim());
      if (g.sireName) names.add(g.sireName.trim());
      if (g.maternalGrandsireName) names.add(g.maternalGrandsireName.trim());
      if (g.paternalGrandsireName) names.add(g.paternalGrandsireName.trim());
    });
    breedings?.forEach((b) => {
      if (b.sireName) names.add(b.sireName.trim());
    });
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [goats, breedings]);

  const breedingForm = useForm<BreedingValues>({
    resolver: zodResolver(breedingSchema),
    defaultValues: {
      breedingMethod: "natural",
      sireName: "",
      semenSource: "",
      semenStrawId: "",
      breedingDate: new Date().toISOString().slice(0, 10),
      expectedKiddingDate: "",
      notes: "",
    },
  });

  const historicalForm = useForm<HistoricalValues>({
    resolver: zodResolver(historicalSchema),
    defaultValues: {
      sireName: "",
      kiddingDate: new Date().toISOString().slice(0, 10),
      breedingDate: "",
      notes: "",
      kids: [{ name: "", sex: "doe", kidStatus: "alive", birthWeight: "" }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: historicalForm.control,
    name: "kids",
  });

  const { usesAi, weightUnit, gestationDays } = useFarmSettings();
  const breedingDate = breedingForm.watch("breedingDate");
  const breedingMethod = breedingForm.watch("breedingMethod");
  const isAi = usesAi && breedingMethod === "ai";
  const kiddingDate = historicalForm.watch("kiddingDate");

  const computedExpected = (() => {
    if (!breedingDate) return "";
    const d = new Date(breedingDate);
    d.setDate(d.getDate() + gestationDays);
    return d.toISOString().slice(0, 10);
  })();

  const autoBreedingDate = (() => {
    if (!kiddingDate) return "";
    const d = new Date(kiddingDate);
    d.setDate(d.getDate() - gestationDays);
    return d.toISOString().slice(0, 10);
  })();

  const handleBreedingSubmit = (data: BreedingValues) => {
    const effectiveMethod = usesAi ? data.breedingMethod : "natural";
    createBreeding.mutate(
      {
        data: {
          doeId: data.doeId,
          breedingMethod: effectiveMethod,
          sireName: data.sireName,
          semenSource: effectiveMethod === "ai" && data.semenSource ? data.semenSource : undefined,
          semenStrawId:
            effectiveMethod === "ai" && data.semenStrawId
              ? Number(data.semenStrawId)
              : undefined,
          breedingDate: new Date(data.breedingDate).toISOString(),
          expectedKiddingDate: data.expectedKiddingDate
            ? new Date(data.expectedKiddingDate).toISOString()
            : undefined,
          notes: data.notes,
        },
      },
      {
        onSuccess: (breeding) => {
          toast({ title: "Breeding recorded" });
          queryClient.invalidateQueries({ queryKey: getListBreedingsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListGoatsQueryKey() });
          setLocation(`/breedings/${breeding.id}`);
        },
        onError: () => toast({ title: "Save failed", variant: "destructive" }),
      }
    );
  };

  const handleHistoricalSubmit = (data: HistoricalValues) => {
    const resolvedBreedingDate = data.breedingDate
      ? new Date(data.breedingDate).toISOString()
      : new Date(autoBreedingDate).toISOString();

    createBreeding.mutate(
      {
        data: {
          doeId: data.doeId,
          sireName: data.sireName,
          breedingDate: resolvedBreedingDate,
          status: "kidded",
          notes: data.notes,
        },
      },
      {
        onSuccess: (breeding) => {
          addKids.mutate(
            {
              id: breeding.id,
              data: {
                birthDate: new Date(data.kiddingDate).toISOString(),
                skipHerdAdd: true,
                kids: data.kids.map((k) => ({
                  name: k.name || undefined,
                  sex: k.sex,
                  kidStatus: k.kidStatus,
                  birthDate: new Date(data.kiddingDate).toISOString(),
                  birthWeight: k.birthWeight !== "" && k.birthWeight !== undefined
                    ? Number(k.birthWeight) : undefined,
                })),
              },
            },
            {
              onSuccess: () => {
                toast({ title: "Historical kidding saved", description: `${data.kids.length} kid(s) recorded.` });
                queryClient.invalidateQueries({ queryKey: getListBreedingsQueryKey() });
                queryClient.invalidateQueries({ queryKey: getListGoatsQueryKey() });
                queryClient.invalidateQueries({ queryKey: getGetBreedingQueryKey(breeding.id) });
                setLocation(`/breedings/${breeding.id}`);
              },
              onError: () => toast({ title: "Kidding details failed to save", variant: "destructive" }),
            }
          );
        },
        onError: () => toast({ title: "Save failed", variant: "destructive" }),
      }
    );
  };

  const isPending = createBreeding.isPending || addKids.isPending;

  return (
    <Layout>
      <div className="space-y-6 animate-in fade-in duration-500 max-w-2xl mx-auto">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/breedings")} className="text-muted-foreground hover:text-foreground -ml-4">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Kiddings
        </Button>

        <div>
          <h2 className="text-3xl font-serif font-bold text-foreground mb-2">
            {mode === "historical" ? "Record Historical Kidding" : "Record Breeding"}
          </h2>
          <p className="text-muted-foreground text-sm">
            {mode === "historical"
              ? "Enter a past kidding event. Provide the actual kidding date and the kids born."
              : "Log a doe being bred to a buck. Her lactation status will automatically update to pregnant."}
          </p>
        </div>

        <div className="flex rounded-lg border border-border overflow-hidden bg-background/50 w-fit">
          <button
            onClick={() => setMode("breeding")}
            className={`px-4 py-2 text-sm font-medium transition-colors ${mode === "breeding" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"}`}
          >
            New Breeding
          </button>
          <button
            onClick={() => setMode("historical")}
            className={`px-4 py-2 text-sm font-medium transition-colors ${mode === "historical" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"}`}
          >
            Historical Kidding
          </button>
        </div>

        {mode === "breeding" ? (
          <Card className="border-primary/10 shadow-lg relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-primary via-secondary to-accent" />
            <CardHeader className="pb-4 pt-8">
              <CardTitle className="font-serif">Breeding Details</CardTitle>
              <CardDescription>Select the doe and enter information about the buck and breeding date.</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...breedingForm}>
                <form onSubmit={breedingForm.handleSubmit(handleBreedingSubmit)} className="space-y-6">
                  {usesAi && (
                  <FormField control={breedingForm.control} name="breedingMethod" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Breeding Method</FormLabel>
                      <FormControl>
                        <div className="flex rounded-lg border border-border overflow-hidden bg-background/50 w-full sm:w-fit">
                          <button
                            type="button"
                            onClick={() => field.onChange("natural")}
                            className={`flex-1 sm:flex-none px-4 py-2 text-sm font-medium transition-colors ${field.value === "natural" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"}`}
                          >
                            Natural Service
                          </button>
                          <button
                            type="button"
                            onClick={() => field.onChange("ai")}
                            className={`flex-1 sm:flex-none px-4 py-2 text-sm font-medium transition-colors ${field.value === "ai" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"}`}
                          >
                            Artificial Insemination
                          </button>
                        </div>
                      </FormControl>
                      <FormDescription>
                        {isAi
                          ? "AI — no buck on the property. The breeding date is the insemination date."
                          : "Natural service — a buck is placed with the doe."}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )} />
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField control={breedingForm.control} name="doeId" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Doe</FormLabel>
                        <Select onValueChange={(v) => field.onChange(parseInt(v, 10))} value={field.value?.toString() ?? ""}>
                          <FormControl>
                            <SelectTrigger className="bg-background/50">
                              <SelectValue placeholder="Select a doe from your herd" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {does.length === 0 ? (
                              <SelectItem value="0" disabled>No does available — add one first</SelectItem>
                            ) : (
                              does.map((g) => (
                                <SelectItem key={g.id} value={g.id.toString()}>
                                  {g.name} ({g.breed})
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <FormField control={breedingForm.control} name="sireName" render={({ field }) => (
                      <FormItem>
                        <FormLabel>{isAi ? "Sire / Straw ID" : "Sire (Buck)"}</FormLabel>
                        <FormControl>
                          <SireSelect
                            value={field.value}
                            onChange={field.onChange}
                            knownSires={knownSires}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />

                    {isAi && (
                      <FormField control={breedingForm.control} name="semenSource" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Semen Source (Optional)</FormLabel>
                          <FormControl>
                            <Input placeholder="Supplier, lot/straw #, etc." {...field} className="bg-background/50" />
                          </FormControl>
                          <FormDescription>Where the straw came from — supplier or stud service.</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )} />
                    )}

                    {isAi && availableStraws.length > 0 && (
                      <FormField control={breedingForm.control} name="semenStrawId" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Draw From Inventory (Optional)</FormLabel>
                          <Select
                            onValueChange={(v) => field.onChange(v === NEW_SENTINEL ? "" : v)}
                            value={field.value || ""}
                          >
                            <FormControl>
                              <SelectTrigger className="bg-background/50">
                                <SelectValue placeholder="Don't draw from inventory" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value={NEW_SENTINEL}>Don't draw from inventory</SelectItem>
                              {availableStraws.map((s) => (
                                <SelectItem key={s.id} value={s.id.toString()}>
                                  {s.sireName}
                                  {s.strawId ? ` · ${s.strawId}` : ""} ({s.count} left)
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormDescription>Selecting a straw will decrement its count by one.</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )} />
                    )}

                    <FormField control={breedingForm.control} name="breedingDate" render={({ field }) => (
                      <FormItem>
                        <FormLabel>{isAi ? "Insemination Date" : "Breeding Date"}</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} className="bg-background/50" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <FormField control={breedingForm.control} name="expectedKiddingDate" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Expected Kidding Date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} placeholder={computedExpected} className="bg-background/50" />
                        </FormControl>
                        <FormDescription>
                          {computedExpected ? `~${gestationDays} days after breeding: ${new Date(computedExpected + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}` : "Leave blank to auto-calculate"}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>

                  <FormField control={breedingForm.control} name="notes" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes (Optional)</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Breeding method, buck's registry info, observations..." className="resize-none bg-background/50" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <div className="flex justify-end">
                    <Button type="submit" disabled={isPending} size="lg" className="min-w-[200px] shadow-md">
                      {isPending ? "Saving..." : "Record Breeding"}
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        ) : (
          <Form {...historicalForm}>
            <form onSubmit={historicalForm.handleSubmit(handleHistoricalSubmit)} className="space-y-6">
              <Card className="border-primary/10 shadow-lg relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-primary via-secondary to-accent" />
                <CardHeader className="pb-4 pt-8">
                  <CardTitle className="font-serif">Kidding Details</CardTitle>
                  <CardDescription>Enter the doe, sire, and actual kidding date for this historical record.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField control={historicalForm.control} name="doeId" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Doe</FormLabel>
                        <Select onValueChange={(v) => field.onChange(parseInt(v, 10))} value={field.value?.toString() ?? ""}>
                          <FormControl>
                            <SelectTrigger className="bg-background/50">
                              <SelectValue placeholder="Select a doe from your herd" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {does.length === 0 ? (
                              <SelectItem value="0" disabled>No does available — add one first</SelectItem>
                            ) : (
                              does.map((g) => (
                                <SelectItem key={g.id} value={g.id.toString()}>
                                  {g.name} ({g.breed})
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <FormField control={historicalForm.control} name="sireName" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Sire (Buck)</FormLabel>
                        <FormControl>
                          <SireSelect
                            value={field.value}
                            onChange={field.onChange}
                            knownSires={knownSires}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <FormField control={historicalForm.control} name="kiddingDate" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Kidding Date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} className="bg-background/50" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <FormField control={historicalForm.control} name="breedingDate" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Breeding Date (Optional)</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} className="bg-background/50" />
                        </FormControl>
                        <FormDescription>
                          {autoBreedingDate
                            ? `Leave blank to use ${new Date(autoBreedingDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} (kidding − ${gestationDays} d)`
                            : "Auto-calculated from kidding date"}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>

                  <div className="mt-6">
                    <FormField control={historicalForm.control} name="notes" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Notes (Optional)</FormLabel>
                        <FormControl>
                          <Textarea placeholder="Any notes about this kidding..." className="resize-none bg-background/50" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                </CardContent>
              </Card>

              <Card className="border-primary/10 shadow-lg">
                <CardHeader className="pb-2">
                  <CardTitle className="font-serif">Kids Born</CardTitle>
                  <CardDescription>Add each kid born during this kidding event.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {fields.map((field, index) => (
                    <div key={field.id} className="rounded-xl border border-border bg-muted/20 p-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-muted-foreground">Kid #{index + 1}</span>
                        {fields.length > 1 && (
                          <Button type="button" variant="ghost" size="sm" onClick={() => remove(index)} className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <FormField control={historicalForm.control} name={`kids.${index}.name`} render={({ field }) => (
                          <FormItem className="col-span-2 md:col-span-2">
                            <FormLabel>Name (Optional)</FormLabel>
                            <FormControl>
                              <GoatNameSelect
                                value={field.value ?? ""}
                                onChange={field.onChange}
                                goatNames={goatNames}
                              />
                            </FormControl>
                          </FormItem>
                        )} />

                        <FormField control={historicalForm.control} name={`kids.${index}.sex`} render={({ field }) => (
                          <FormItem>
                            <FormLabel>Sex</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger className="bg-background/50">
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="doe">Doe ♀</SelectItem>
                                <SelectItem value="buck">Buck ♂</SelectItem>
                              </SelectContent>
                            </Select>
                          </FormItem>
                        )} />

                        <FormField control={historicalForm.control} name={`kids.${index}.kidStatus`} render={({ field }) => (
                          <FormItem>
                            <FormLabel>Status</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger className="bg-background/50">
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="alive">Alive</SelectItem>
                                <SelectItem value="sold">Sold</SelectItem>
                                <SelectItem value="dead">Dead</SelectItem>
                                <SelectItem value="doa">DOA</SelectItem>
                              </SelectContent>
                            </Select>
                          </FormItem>
                        )} />

                        <FormField control={historicalForm.control} name={`kids.${index}.birthWeight`} render={({ field }) => (
                          <FormItem className="col-span-2 md:col-span-1">
                            <FormLabel>Birth Weight ({weightUnitLabel(weightUnit)})</FormLabel>
                            <FormControl>
                              <Input type="number" step="0.1" placeholder="e.g. 4.2" {...field} className="bg-background/50" />
                            </FormControl>
                          </FormItem>
                        )} />
                      </div>
                    </div>
                  ))}

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => append({ name: "", sex: "doe", kidStatus: "alive", birthWeight: "" })}
                    className="w-full border-dashed"
                  >
                    <Plus className="mr-2 h-4 w-4" /> Add Another Kid
                  </Button>

                  {historicalForm.formState.errors.kids?.root && (
                    <p className="text-sm text-destructive">{historicalForm.formState.errors.kids.root.message}</p>
                  )}
                </CardContent>
              </Card>

              <div className="flex justify-end">
                <Button type="submit" disabled={isPending} size="lg" className="min-w-[240px] shadow-md">
                  {isPending ? "Saving..." : "Save Historical Kidding"}
                </Button>
              </div>
            </form>
          </Form>
        )}
      </div>
    </Layout>
  );
}
