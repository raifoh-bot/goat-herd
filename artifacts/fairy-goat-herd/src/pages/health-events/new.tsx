import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { AlertTriangle, ArrowLeft, ArrowRight, CalendarClock, Check, ClipboardCheck, Loader2, Search } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetHealthEventBulkSessionQueryKey,
  getGetHealthWorkDueQueryKey,
  getListGoatHealthEventsQueryKey,
  useCreateHealthEventsBulk,
  useGetHealthEventBulkSession,
  useGetHealthWorkDue,
} from "@workspace/api-client-react";
import type {
  BulkHealthEventItem,
  DueHealthItem,
  HealthEventEventType,
} from "@workspace/api-client-react/src/generated/api.schemas";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { breedLabels, getBreedOptions } from "@/lib/breeds";
import { todayInputValue, dateInputToIso } from "@/lib/date";
import { sexLabel, matchesHerdStatus } from "@/lib/goats";
import { COPPER_BOLUS_DOSES_G, doseUnit, famachaSuggestsDeworming } from "@/lib/health";
import { useFarmSettings, weightUnitLabel } from "@/lib/settings";
import { HEALTH_EVENT_TYPES } from "@/components/health-history";

const STEPS = ["Select Goats", "Choose Tasks", "Goat Details & Review"] as const;

// Event types that support a per-goat dose.
const DOSAGE_TYPES: HealthEventEventType[] = ["cdt_shot", "copper_bolus", "deworming", "other"];

// Short labels for the schedulable task types shown on due badges.
const SCHEDULE_TYPE_LABELS: Record<string, string> = {
  hoof_trim: "Hoof trim",
  cdt_shot: "CD&T",
  copper_bolus: "Copper bolus",
  deworming: "Deworming",
  cidr: "CIDR removal",
};

/**
 * Goats and task types to pre-tick when starting a work day: items that are
 * overdue or have never been done. CIDR removals are reminder-only — they are
 * badged on goat rows but never become a bulk work-day task (the bulk endpoint
 * doesn't accept CIDR, and removal is a per-doe action, not herd work).
 */
export function deriveWorkDayPreselection(
  dueData: { goats: { goat: { id: number }; items: DueHealthItem[] }[] } | undefined,
): { dueGoatIds: Set<number>; dueTaskTypes: Set<HealthEventEventType> } {
  const goatIds = new Set<number>();
  const taskTypes = new Set<HealthEventEventType>();
  for (const entry of dueData?.goats ?? []) {
    const actionable = entry.items.filter(
      (i) => (i.status === "overdue" || i.status === "never") && i.eventType !== "cidr",
    );
    if (actionable.length === 0) continue;
    goatIds.add(entry.goat.id);
    for (const item of actionable) taskTypes.add(item.eventType as HealthEventEventType);
  }
  return { dueGoatIds: goatIds, dueTaskTypes: taskTypes };
}

/** A compact human phrase for how overdue (or how new) a due item is. */
function dueItemLabel(item: DueHealthItem): string {
  const name = SCHEDULE_TYPE_LABELS[item.eventType] ?? item.eventType;
  if (item.status === "never") return `${name} · never done`;
  if (item.status === "overdue") {
    const d = item.daysOverdue;
    return `${name} · ${d === 0 ? "due today" : `${d} day${d === 1 ? "" : "s"} overdue`}`;
  }
  return `${name} · due soon`;
}

export default function HerdWorkDay() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { famachaThreshold, weightUnit, enabledBreeds } = useFarmSettings();

  const { data: goats, isLoading } = useGetHealthEventBulkSession({
    query: { queryKey: getGetHealthEventBulkSessionQueryKey() },
  });
  const { data: dueData } = useGetHealthWorkDue({
    query: { queryKey: getGetHealthWorkDueQueryKey(), staleTime: 30_000 },
  });
  const bulkCreate = useCreateHealthEventsBulk();

  const [step, setStep] = useState(0);
  const [search, setSearch] = useState("");
  const [breedFilter, setBreedFilter] = useState<string | undefined>(undefined);
  const [sexFilter, setSexFilter] = useState<string | undefined>(undefined);
  const [herdStatusFilter, setHerdStatusFilter] = useState<string | undefined>("on-farm");
  const [selectedGoatIds, setSelectedGoatIds] = useState<Set<number>>(new Set());
  const [selectedTypes, setSelectedTypes] = useState<Set<HealthEventEventType>>(new Set());
  const [eventDate, setEventDate] = useState(todayInputValue());
  const [productByType, setProductByType] = useState<Partial<Record<HealthEventEventType, string>>>({});
  const [dosageByType, setDosageByType] = useState<Partial<Record<HealthEventEventType, string>>>({});
  const [famachaScores, setFamachaScores] = useState<Record<number, string>>({});
  const [weightByGoat, setWeightByGoat] = useState<Record<number, string>>({});
  // Per-goat dose overrides, keyed "<goatId>:<eventType>". Falls back to the
  // step-2 default dose for that event type when left blank.
  const [doseByGoatType, setDoseByGoatType] = useState<Record<string, string>>({});
  const [dewormOptOut, setDewormOptOut] = useState<Set<number>>(new Set());

  const allGoats = useMemo(() => goats ?? [], [goats]);
  const breedOptions = useMemo(() => getBreedOptions(enabledBreeds), [enabledBreeds]);
  const filteredGoats = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allGoats.filter((g) => {
      if (q && !g.name.toLowerCase().includes(q)) return false;
      if (breedFilter && g.breed !== breedFilter) return false;
      if (sexFilter && g.sex !== sexFilter) return false;
      if (!matchesHerdStatus(g, herdStatusFilter)) return false;
      return true;
    });
  }, [allGoats, search, breedFilter, sexFilter, herdStatusFilter]);
  const selectedGoats = useMemo(
    () => allGoats.filter((g) => selectedGoatIds.has(g.id)),
    [allGoats, selectedGoatIds],
  );

  // Map goatId -> its due items so we can badge rows in the picker.
  const dueByGoat = useMemo(() => {
    const map = new Map<number, DueHealthItem[]>();
    for (const entry of dueData?.goats ?? []) map.set(entry.goat.id, entry.items);
    return map;
  }, [dueData]);

  // Goats and task types that are due now (overdue) or have never been done.
  // These drive the one-time pre-selection so a farmer starts a work day with
  // the right goats and tasks already ticked.
  const { dueGoatIds, dueTaskTypes } = useMemo(() => deriveWorkDayPreselection(dueData), [dueData]);

  // Pre-select due goats and their tasks exactly once, after the due list
  // arrives. We never override the farmer's later manual edits.
  const didPreselect = useRef(false);
  useEffect(() => {
    if (didPreselect.current || !dueData) return;
    didPreselect.current = true;
    if (dueGoatIds.size > 0) setSelectedGoatIds(new Set(dueGoatIds));
    if (dueTaskTypes.size > 0) setSelectedTypes(new Set(dueTaskTypes));
  }, [dueData, dueGoatIds, dueTaskTypes]);

  const famachaSelected = selectedTypes.has("famacha");
  const dewormingSelected = selectedTypes.has("deworming");
  const selectedDosageTypes = useMemo(
    () => DOSAGE_TYPES.filter((t) => selectedTypes.has(t)),
    [selectedTypes],
  );

  // Goats whose FAMACHA score is at/above the farm threshold and should get a
  // suggested deworming event (unless the user opts out or deworming is
  // already a selected task for everyone).
  const flaggedGoatIds = useMemo(() => {
    if (!famachaSelected || dewormingSelected) return new Set<number>();
    const flagged = new Set<number>();
    for (const g of selectedGoats) {
      const score = Number(famachaScores[g.id]);
      if (famachaSuggestsDeworming(score, famachaThreshold)) flagged.add(g.id);
    }
    return flagged;
  }, [famachaSelected, dewormingSelected, selectedGoats, famachaScores, famachaThreshold]);

  const toggleGoat = (id: number) => {
    setSelectedGoatIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleType = (type: HealthEventEventType) => {
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const missingScores = famachaSelected
    ? selectedGoats.filter((g) => !famachaScores[g.id]).length
    : 0;

  const totalEvents = useMemo(() => {
    let count = selectedGoats.length * selectedTypes.size;
    for (const id of flaggedGoatIds) {
      if (!dewormOptOut.has(id)) count += 1;
    }
    return count;
  }, [selectedGoats.length, selectedTypes.size, flaggedGoatIds, dewormOptOut]);

  const submit = () => {
    if (!eventDate) {
      toast({ title: "Pick a date", description: "The work day date is required.", variant: "destructive" });
      return;
    }
    const events: BulkHealthEventItem[] = [];
    for (const goat of selectedGoats) {
      const weightStr = weightByGoat[goat.id];
      const weight = weightStr ? Number(weightStr) : null;
      const hasWeight = weight != null && weight > 0;
      for (const type of selectedTypes) {
        // CIDR is per-doe/protocol-driven and never offered in the herd work
        // day wizard, so the wider event type narrows safely to the bulk enum.
        const item: BulkHealthEventItem = {
          goatId: goat.id,
          eventType: type as BulkHealthEventItem["eventType"],
        };
        if (type === "famacha" || type === "deworming") {
          const score = Number(famachaScores[goat.id]);
          if (score >= 1 && score <= 5) item.famachaScore = score;
        }
        const product = productByType[type]?.trim();
        if (product) item.productName = product;
        // The goat's own dose wins; the step-2 default fills the gaps.
        const doseStr = doseByGoatType[`${goat.id}:${type}`] || dosageByType[type];
        const dose = doseStr ? Number(doseStr) : null;
        if (dose != null && dose > 0) item.dosageMl = dose;
        if (hasWeight) item.bodyWeight = weight;
        events.push(item);
      }
      if (flaggedGoatIds.has(goat.id) && !dewormOptOut.has(goat.id)) {
        const score = Number(famachaScores[goat.id]);
        events.push({
          goatId: goat.id,
          eventType: "deworming",
          ...(score >= 1 && score <= 5 ? { famachaScore: score } : {}),
          ...(hasWeight ? { bodyWeight: weight } : {}),
        });
      }
    }
    bulkCreate.mutate(
      { data: { eventDate: dateInputToIso(eventDate), events } },
      {
        onSuccess: (res) => {
          for (const goat of selectedGoats) {
            queryClient.invalidateQueries({ queryKey: getListGoatHealthEventsQueryKey(goat.id) });
          }
          queryClient.invalidateQueries({ queryKey: getGetHealthWorkDueQueryKey() });
          toast({
            title: "Herd work day logged",
            description: `${res.created} health event${res.created === 1 ? "" : "s"} recorded for ${selectedGoats.length} goat${selectedGoats.length === 1 ? "" : "s"}.`,
          });
          setLocation("/goats");
        },
        onError: () =>
          toast({
            title: "Could not save",
            description: "The work day could not be recorded. Please try again.",
            variant: "destructive",
          }),
      },
    );
  };

  return (
    <Layout>
      <div className="p-6 md:p-8 max-w-3xl mx-auto">
        <Link href="/goats">
          <Button variant="ghost" size="sm" className="mb-4 -ml-2 text-muted-foreground">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to Herd
          </Button>
        </Link>

        <div className="mb-6">
          <h1 className="font-serif text-2xl md:text-3xl font-semibold text-foreground flex items-center gap-3">
            <ClipboardCheck className="h-7 w-7 text-primary" /> Herd Work Day
          </h1>
          <p className="text-muted-foreground mt-1">
            Log hoof trims, shots, FAMACHA scores, and dewormings for many goats at once.
          </p>
        </div>

        <div className="flex items-center gap-2 mb-6">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center gap-2 flex-1">
              <div
                className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${
                  i < step
                    ? "bg-primary text-primary-foreground"
                    : i === step
                    ? "bg-primary/15 text-primary border border-primary"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </div>
              <span className={`text-xs font-medium hidden sm:block ${i === step ? "text-foreground" : "text-muted-foreground"}`}>
                {label}
              </span>
              {i < STEPS.length - 1 && <div className="h-px bg-border flex-1" />}
            </div>
          ))}
        </div>

        {step === 0 && (
          <Card className="border-primary/10 shadow-md">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 gap-4">
              <CardTitle className="font-serif text-lg">Which goats did you work?</CardTitle>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setSelectedGoatIds((prev) => new Set([...prev, ...filteredGoats.map((g) => g.id)]))
                  }
                  disabled={isLoading || filteredGoats.length === 0}
                >
                  Select all
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedGoatIds(new Set())}
                  disabled={selectedGoatIds.size === 0}
                >
                  Clear
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {dueGoatIds.size > 0 && (
                <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
                  <CalendarClock className="h-4 w-4 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium">
                      {dueGoatIds.size} goat{dueGoatIds.size === 1 ? "" : "s"} due for routine work
                    </p>
                    <p className="text-amber-800/80 dark:text-amber-200/80">
                      Due and overdue goats and their tasks are pre-selected based on your
                      farm's schedules. Adjust anything below before continuing.
                    </p>
                  </div>
                </div>
              )}
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search goats..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Select
                  value={herdStatusFilter || "all"}
                  onValueChange={(val) => setHerdStatusFilter(val === "all" ? undefined : val)}
                >
                  <SelectTrigger className="w-full sm:w-[160px]">
                    <SelectValue placeholder="Herd Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Herd Status</SelectItem>
                    <SelectItem value="on-farm">On Farm</SelectItem>
                    <SelectItem value="on-farm-boarding">On Farm - Boarding</SelectItem>
                    <SelectItem value="leased">Leased</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={breedFilter || "all"}
                  onValueChange={(val) => setBreedFilter(val === "all" ? undefined : val)}
                >
                  <SelectTrigger className="w-full sm:w-[160px]">
                    <SelectValue placeholder="Breed" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Breeds</SelectItem>
                    {breedOptions.map((b) => (
                      <SelectItem key={b.slug} value={b.slug}>{b.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={sexFilter || "all"}
                  onValueChange={(val) => setSexFilter(val === "all" ? undefined : val)}
                >
                  <SelectTrigger className="w-full sm:w-[130px]">
                    <SelectValue placeholder="Sex" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sexes</SelectItem>
                    <SelectItem value="doe">Does</SelectItem>
                    <SelectItem value="buck">Bucks</SelectItem>
                    <SelectItem value="wether">Wethers</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {isLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
                </div>
              ) : filteredGoats.length === 0 ? (
                <p className="text-sm text-muted-foreground italic py-6 text-center">
                  {allGoats.length === 0 ? "No active goats in the herd." : "No goats match that search."}
                </p>
              ) : (
                <div className="max-h-[45vh] overflow-y-auto space-y-1.5 pr-1">
                  {filteredGoats.map((goat) => (
                    <label
                      key={goat.id}
                      className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                        selectedGoatIds.has(goat.id) ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
                      }`}
                    >
                      <Checkbox
                        checked={selectedGoatIds.has(goat.id)}
                        onCheckedChange={() => toggleGoat(goat.id)}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-foreground truncate">{goat.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {breedLabels[goat.breed] ?? goat.breed}
                          {goat.sex ? ` · ${sexLabel(goat.sex)}` : ""}
                        </p>
                        {(dueByGoat.get(goat.id)?.length ?? 0) > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {dueByGoat.get(goat.id)!.map((item) => {
                              const isOverdue = item.status === "overdue" || item.status === "never";
                              return (
                                <span
                                  key={item.eventType}
                                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                    isOverdue
                                      ? "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200"
                                      : "bg-muted text-muted-foreground"
                                  }`}
                                >
                                  {dueItemLabel(item)}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between pt-2">
                <span className="text-sm text-muted-foreground">
                  {selectedGoatIds.size} goat{selectedGoatIds.size === 1 ? "" : "s"} selected
                </span>
                <Button onClick={() => setStep(1)} disabled={selectedGoatIds.size === 0}>
                  Next <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 1 && (
          <Card className="border-primary/10 shadow-md">
            <CardHeader>
              <CardTitle className="font-serif text-lg">What was done?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5 max-w-[220px]">
                <Label htmlFor="wd-date">Work day date</Label>
                <Input id="wd-date" type="date" value={eventDate} max={todayInputValue()} onChange={(e) => setEventDate(e.target.value)} />
              </div>

              <div className="space-y-2">
                {/* CIDR and Parasites are per-goat entries (the bulk endpoint
                    doesn't accept them), so they're never offered as herd
                    work-day tasks. */}
                {HEALTH_EVENT_TYPES.filter((t) => t.value !== "cidr" && t.value !== "parasites").map((t) => {
                  const Icon = t.icon;
                  const active = selectedTypes.has(t.value);
                  const showProductInputs =
                    active && (t.value === "cdt_shot" || t.value === "copper_bolus" || t.value === "deworming" || t.value === "other");
                  return (
                    <div key={t.value} className={`rounded-lg border transition-colors ${active ? "border-primary bg-primary/5" : "border-border"}`}>
                      <label className="flex items-center gap-3 p-3 cursor-pointer">
                        <Checkbox checked={active} onCheckedChange={() => toggleType(t.value)} />
                        <Icon className="h-4 w-4 text-primary" />
                        <span className="font-medium text-sm text-foreground">{t.label}</span>
                      </label>
                      {showProductInputs && (
                        <div className="grid grid-cols-2 gap-3 px-3 pb-3 pl-10">
                          <div className="space-y-1">
                            <Label className="text-xs">Product (optional)</Label>
                            <Input
                              placeholder="e.g. Cydectin"
                              value={productByType[t.value] ?? ""}
                              onChange={(e) => setProductByType((p) => ({ ...p, [t.value]: e.target.value }))}
                            />
                          </div>
                          <div className="space-y-1">
                            {t.value === "copper_bolus" ? (
                              <>
                                <Label className="text-xs">Default dose g (optional)</Label>
                                <Select
                                  value={dosageByType[t.value] ?? "none"}
                                  onValueChange={(v) =>
                                    setDosageByType((p) => ({ ...p, [t.value]: v === "none" ? "" : v }))
                                  }
                                >
                                  <SelectTrigger aria-label="Default copper bolus dose in grams">
                                    <SelectValue placeholder="Select dose" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="none">—</SelectItem>
                                    {COPPER_BOLUS_DOSES_G.map((g) => (
                                      <SelectItem key={g} value={String(g)}>{g} g</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </>
                            ) : (
                              <>
                                <Label className="text-xs">Default dose mL (optional)</Label>
                                <Input
                                  type="number"
                                  min={0}
                                  step="0.1"
                                  placeholder="Per-goat override next step"
                                  value={dosageByType[t.value] ?? ""}
                                  onChange={(e) => setDosageByType((p) => ({ ...p, [t.value]: e.target.value }))}
                                />
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between pt-2">
                <Button variant="outline" onClick={() => setStep(0)}>
                  <ArrowLeft className="h-4 w-4 mr-1" /> Back
                </Button>
                <Button onClick={() => setStep(2)} disabled={selectedTypes.size === 0}>
                  Next <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 2 && (
          <Card className="border-primary/10 shadow-md">
            <CardHeader>
              <CardTitle className="font-serif text-lg">
                {famachaSelected ? "Score each goat & review" : "Review & save"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm">
                <p className="text-foreground font-medium mb-1">
                  {selectedGoats.length} goat{selectedGoats.length === 1 ? "" : "s"} · {" "}
                  {[...selectedTypes].map((t) => HEALTH_EVENT_TYPES.find((x) => x.value === t)?.label).join(", ")}
                </p>
                <p className="text-muted-foreground">
                  {totalEvents} event{totalEvents === 1 ? "" : "s"} will be recorded for{" "}
                  {new Date(`${eventDate}T12:00:00`).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}.
                </p>
              </div>

              <div className="space-y-2">
                <Label>
                  Per-goat details
                  {famachaSelected ? " — FAMACHA: 1 = healthy, 5 = severely anemic" : ""}
                </Label>
                <div className="max-h-[45vh] overflow-y-auto space-y-1.5 pr-1">
                  {selectedGoats.map((goat) => {
                    const score = famachaScores[goat.id];
                    const flagged = flaggedGoatIds.has(goat.id);
                    return (
                      <div key={goat.id} className={`rounded-lg border p-3 space-y-2 ${flagged ? "border-amber-300 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-800" : "border-border"}`}>
                        <div className="flex items-center gap-3">
                          <span className="font-medium text-sm text-foreground flex-1 truncate">{goat.name}</span>
                          {famachaSelected && (
                            <Select
                              value={score ?? ""}
                              onValueChange={(v) => setFamachaScores((p) => ({ ...p, [goat.id]: v }))}
                            >
                              <SelectTrigger className="w-[130px]" aria-label={`FAMACHA score for ${goat.name}`}>
                                <SelectValue placeholder="FAMACHA" />
                              </SelectTrigger>
                              <SelectContent>
                                {[1, 2, 3, 4, 5].map((s) => (
                                  <SelectItem key={s} value={String(s)}>{s}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">
                              Weight {weightUnitLabel(weightUnit)} (optional)
                            </Label>
                            <Input
                              type="number"
                              min={0}
                              step="0.1"
                              className="h-8"
                              value={weightByGoat[goat.id] ?? ""}
                              onChange={(e) => setWeightByGoat((p) => ({ ...p, [goat.id]: e.target.value }))}
                              aria-label={`Body weight for ${goat.name}`}
                            />
                          </div>
                          {selectedDosageTypes.map((type) => (
                            <div key={type} className="space-y-1">
                              <Label className="text-xs text-muted-foreground">
                                {HEALTH_EVENT_TYPES.find((t) => t.value === type)?.label} dose {doseUnit(type)}
                              </Label>
                              {type === "copper_bolus" ? (
                                <Select
                                  value={doseByGoatType[`${goat.id}:${type}`] ?? "default"}
                                  onValueChange={(v) =>
                                    setDoseByGoatType((p) => ({ ...p, [`${goat.id}:${type}`]: v === "default" ? "" : v }))
                                  }
                                >
                                  <SelectTrigger className="h-8" aria-label={`Copper bolus dose for ${goat.name}`}>
                                    <SelectValue placeholder={dosageByType[type] ? `${dosageByType[type]} g` : "—"} />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="default">
                                      {dosageByType[type] ? `Default (${dosageByType[type]} g)` : "—"}
                                    </SelectItem>
                                    {COPPER_BOLUS_DOSES_G.map((g) => (
                                      <SelectItem key={g} value={String(g)}>{g} g</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <Input
                                  type="number"
                                  min={0}
                                  step="0.1"
                                  className="h-8"
                                  placeholder={dosageByType[type] || "—"}
                                  value={doseByGoatType[`${goat.id}:${type}`] ?? ""}
                                  onChange={(e) =>
                                    setDoseByGoatType((p) => ({ ...p, [`${goat.id}:${type}`]: e.target.value }))
                                  }
                                  aria-label={`${type} dose for ${goat.name}`}
                                />
                              )}
                            </div>
                          ))}
                        </div>
                        {flagged && (
                          <div className="flex items-start gap-2 text-xs text-amber-800 dark:text-amber-300">
                            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                            <label className="flex items-center gap-2 cursor-pointer">
                              <Checkbox
                                checked={!dewormOptOut.has(goat.id)}
                                onCheckedChange={(checked) =>
                                  setDewormOptOut((prev) => {
                                    const next = new Set(prev);
                                    if (checked) next.delete(goat.id);
                                    else next.add(goat.id);
                                    return next;
                                  })
                                }
                              />
                              <span>
                                Score at/above threshold ({famachaThreshold}+) — also log a deworming for {goat.name}
                              </span>
                            </label>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {famachaSelected && missingScores > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {missingScores} goat{missingScores === 1 ? " is" : "s are"} missing a score — their FAMACHA event will be saved without one.
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between pt-2">
                <Button variant="outline" onClick={() => setStep(1)}>
                  <ArrowLeft className="h-4 w-4 mr-1" /> Back
                </Button>
                <Button onClick={submit} disabled={bulkCreate.isPending || totalEvents === 0}>
                  {bulkCreate.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Save {totalEvents} Event{totalEvents === 1 ? "" : "s"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
