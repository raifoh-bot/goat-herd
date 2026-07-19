import { Fragment, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { AlertTriangle, ArrowLeft, ClipboardList, Loader2, Search } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetHealthEventBulkSessionQueryKey,
  getListGoatHealthEventsQueryKey,
  useCreateHealthEventsBulk,
  useGetHealthEventBulkSession,
} from "@workspace/api-client-react";
import type { BulkHealthEventItem } from "@workspace/api-client-react/src/generated/api.schemas";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { breedLabel, getBreedOptions } from "@/lib/breeds";
import { todayInputValue, dateInputToIso } from "@/lib/date";
import { sexLabel, matchesHerdStatus } from "@/lib/goats";
import { COPPER_BOLUS_DOSES_G, famachaSuggestsDeworming } from "@/lib/health";
import { useFarmSettings, weightUnitLabel } from "@/lib/settings";

/** What the farmer transcribed for one goat's worksheet row. */
interface RowState {
  famacha: string;
  deworm: boolean;
  dewormProduct: string;
  dewormDose: string;
  hoofTrim: boolean;
  cdt: boolean;
  copperBolus: boolean;
  copperDose: string;
  weight: string;
  notes: string;
  /** Opt out of the auto-suggested deworming when FAMACHA is at/above threshold. */
  dewormOptOut: boolean;
}

const EMPTY_ROW: RowState = {
  famacha: "",
  deworm: false,
  dewormProduct: "",
  dewormDose: "",
  hoofTrim: false,
  cdt: false,
  copperBolus: false,
  copperDose: "",
  weight: "",
  notes: "",
  dewormOptOut: false,
};

/**
 * Worksheet Results — a per-goat entry grid that mirrors the printed Barn
 * Worksheet columns (FAMACHA, deworming, hoof trim, CDT, copper bolus, weight,
 * notes). The farmer types back what they wrote by hand and everything is
 * saved as health events in one transaction via the bulk endpoint.
 */
export default function WorksheetResults() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { famachaThreshold, weightUnit, enabledBreeds } = useFarmSettings();

  const { data: goats, isLoading } = useGetHealthEventBulkSession({
    query: { queryKey: getGetHealthEventBulkSessionQueryKey() },
  });
  const bulkCreate = useCreateHealthEventsBulk();

  const [eventDate, setEventDate] = useState(todayInputValue());
  const [search, setSearch] = useState("");
  const [breedFilter, setBreedFilter] = useState<string | undefined>(undefined);
  const [sexFilter, setSexFilter] = useState<string | undefined>(undefined);
  const [herdStatusFilter, setHerdStatusFilter] = useState<string | undefined>("on-farm");

  const breedOptions = useMemo(() => getBreedOptions(enabledBreeds), [enabledBreeds]);
  const [rows, setRows] = useState<Record<number, RowState>>({});

  const rowOf = (id: number): RowState => rows[id] ?? EMPTY_ROW;
  const updateRow = (id: number, patch: Partial<RowState>) =>
    setRows((prev) => ({ ...prev, [id]: { ...(prev[id] ?? EMPTY_ROW), ...patch } }));

  const allGoats = useMemo(() => goats ?? [], [goats]);
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

  /** Whether a goat's FAMACHA is at/above threshold with no deworming marked. */
  const isFlagged = (goat: { id: number }) => {
    const row = rowOf(goat.id);
    if (row.deworm) return false;
    const score = Number(row.famacha);
    return famachaSuggestsDeworming(score, famachaThreshold);
  };

  /** Turn one goat's transcribed row into the health events it represents. */
  const eventsForGoat = (goatId: number): BulkHealthEventItem[] => {
    const row = rowOf(goatId);
    const items: BulkHealthEventItem[] = [];
    const score = Number(row.famacha);
    const hasScore = score >= 1 && score <= 5;

    if (hasScore) {
      items.push({ goatId, eventType: "famacha", famachaScore: score });
    }

    const dewormAuto = !row.deworm && hasScore && famachaSuggestsDeworming(score, famachaThreshold) && !row.dewormOptOut;
    if (row.deworm || dewormAuto) {
      const item: BulkHealthEventItem = { goatId, eventType: "deworming" };
      if (hasScore) item.famachaScore = score;
      const product = row.dewormProduct.trim();
      if (product) item.productName = product;
      const dose = row.dewormDose ? Number(row.dewormDose) : null;
      if (dose != null && dose > 0) item.dosageMl = dose;
      items.push(item);
    }

    if (row.hoofTrim) items.push({ goatId, eventType: "hoof_trim" });
    if (row.cdt) items.push({ goatId, eventType: "cdt_shot" });
    if (row.copperBolus) {
      const item: BulkHealthEventItem = { goatId, eventType: "copper_bolus" };
      const copperDose = row.copperDose ? Number(row.copperDose) : null;
      if (copperDose != null && copperDose > 0) item.dosageMl = copperDose;
      items.push(item);
    }

    // Weight is attached to every event for the goat (matches the wizard); a
    // notes line is attached to the goat's first event so it isn't duplicated.
    const weight = row.weight ? Number(row.weight) : null;
    const hasWeight = weight != null && weight > 0;
    const notes = row.notes.trim();
    if (items.length > 0) {
      for (const item of items) if (hasWeight) item.bodyWeight = weight;
      if (notes) items[0].notes = notes;
    }
    return items;
  };

  const allEvents = useMemo(() => {
    const events: BulkHealthEventItem[] = [];
    for (const goat of allGoats) events.push(...eventsForGoat(goat.id));
    return events;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allGoats, rows, famachaThreshold]);

  const goatsWithData = useMemo(() => {
    const ids = new Set(allEvents.map((e) => e.goatId));
    return ids.size;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allEvents]);

  const submit = () => {
    if (!eventDate) {
      toast({ title: "Pick a date", description: "The work day date is required.", variant: "destructive" });
      return;
    }
    if (allEvents.length === 0) {
      toast({
        title: "Nothing to save",
        description: "Fill in at least one goat's tasks before saving.",
        variant: "destructive",
      });
      return;
    }
    const affectedGoatIds = Array.from(new Set(allEvents.map((e) => e.goatId)));
    bulkCreate.mutate(
      { data: { eventDate: dateInputToIso(eventDate), events: allEvents } },
      {
        onSuccess: (res) => {
          for (const id of affectedGoatIds) {
            queryClient.invalidateQueries({ queryKey: getListGoatHealthEventsQueryKey(id) });
          }
          toast({
            title: "Worksheet saved",
            description: `${res.created} health event${res.created === 1 ? "" : "s"} recorded for ${affectedGoatIds.length} goat${affectedGoatIds.length === 1 ? "" : "s"}.`,
          });
          setLocation("/goats");
        },
        onError: () =>
          toast({
            title: "Could not save",
            description: "The worksheet could not be recorded. Please try again.",
            variant: "destructive",
          }),
      },
    );
  };

  return (
    <Layout>
      <div className="p-6 md:p-8 max-w-6xl mx-auto">
        <Link href="/reports/barn-worksheet">
          <Button variant="ghost" size="sm" className="mb-4 -ml-2 text-muted-foreground">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to Barn Worksheet
          </Button>
        </Link>

        <div className="mb-6">
          <h1 className="font-serif text-2xl md:text-3xl font-semibold text-foreground flex items-center gap-3">
            <ClipboardList className="h-7 w-7 text-primary" /> Enter Barn Worksheet Results
          </h1>
          <p className="text-muted-foreground mt-1">
            Type in what you wrote on the printed Barn Worksheet. Leave a goat's row blank to skip it —
            only filled-in cells are saved.
          </p>
        </div>

        <Card className="border-primary/10 shadow-md">
          <CardHeader className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-end gap-4">
              <div className="space-y-1.5 max-w-[220px]">
                <Label htmlFor="ws-date">Work day date</Label>
                <Input
                  id="ws-date"
                  type="date"
                  value={eventDate}
                  max={todayInputValue()}
                  onChange={(e) => setEventDate(e.target.value)}
                />
              </div>
              <div className="flex-1" />
            </div>

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
                <SelectTrigger className="w-full sm:w-[170px]">
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
                <SelectTrigger className="w-full sm:w-[170px]">
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
                <SelectTrigger className="w-full sm:w-[140px]">
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
          </CardHeader>

          <CardContent className="space-y-4">
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
              </div>
            ) : filteredGoats.length === 0 ? (
              <p className="text-sm text-muted-foreground italic py-10 text-center">
                {allGoats.length === 0 ? "No active goats in the herd." : "No goats match those filters."}
              </p>
            ) : (
              <div className="hidden md:block overflow-x-auto -mx-6 px-6">
                <table className="w-full text-sm border-collapse min-w-[900px]">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="py-2 pr-3 font-semibold text-foreground whitespace-nowrap sticky left-0 bg-card">Goat</th>
                      <th className="px-2 py-2 font-semibold text-foreground text-center whitespace-nowrap">FAMACHA</th>
                      <th className="px-2 py-2 font-semibold text-foreground whitespace-nowrap">Dewormed</th>
                      <th className="px-2 py-2 font-semibold text-foreground text-center whitespace-nowrap">Hoof Trim</th>
                      <th className="px-2 py-2 font-semibold text-foreground text-center whitespace-nowrap">CDT</th>
                      <th className="px-2 py-2 font-semibold text-foreground text-center whitespace-nowrap">Copper Bolus</th>
                      <th className="px-2 py-2 font-semibold text-foreground whitespace-nowrap">Weight {weightUnitLabel(weightUnit)}</th>
                      <th className="px-2 py-2 font-semibold text-foreground whitespace-nowrap min-w-[180px]">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredGoats.map((goat) => {
                      const row = rowOf(goat.id);
                      const flagged = isFlagged(goat);
                      return (
                        <Fragment key={goat.id}>
                          <tr
                            className={`border-b border-border/60 ${flagged ? "bg-amber-50/60 dark:bg-amber-950/20" : ""}`}
                          >
                            <td className="py-2 pr-3 align-top sticky left-0 bg-card">
                              <p className="font-medium text-foreground truncate max-w-[160px]">{goat.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {breedLabel(goat.breed)} · {sexLabel(goat.sex)}
                              </p>
                            </td>
                            <td className="px-2 py-2 align-top text-center">
                              <Select
                                value={row.famacha || "none"}
                                onValueChange={(v) => updateRow(goat.id, { famacha: v === "none" ? "" : v })}
                              >
                                <SelectTrigger className="h-8 w-[72px] mx-auto" aria-label={`FAMACHA score for ${goat.name}`}>
                                  <SelectValue placeholder="—" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">—</SelectItem>
                                  {[1, 2, 3, 4, 5].map((s) => (
                                    <SelectItem key={s} value={String(s)}>{s}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="px-2 py-2 align-top">
                              <div className="flex items-start gap-2">
                                <Checkbox
                                  className="mt-1.5"
                                  checked={row.deworm}
                                  onCheckedChange={(c) => updateRow(goat.id, { deworm: c === true })}
                                  aria-label={`Dewormed ${goat.name}`}
                                />
                                {row.deworm && (
                                  <div className="flex flex-col gap-1.5 w-[190px]">
                                    <Input
                                      className="h-8"
                                      placeholder="Product (e.g. Cydectin)"
                                      value={row.dewormProduct}
                                      onChange={(e) => updateRow(goat.id, { dewormProduct: e.target.value })}
                                      aria-label={`Dewormer product for ${goat.name}`}
                                    />
                                    <Input
                                      className="h-8"
                                      type="number"
                                      min={0}
                                      step="0.1"
                                      placeholder="Dose mL"
                                      value={row.dewormDose}
                                      onChange={(e) => updateRow(goat.id, { dewormDose: e.target.value })}
                                      aria-label={`Dewormer dose for ${goat.name}`}
                                    />
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="px-2 py-2 align-top text-center">
                              <Checkbox
                                checked={row.hoofTrim}
                                onCheckedChange={(c) => updateRow(goat.id, { hoofTrim: c === true })}
                                aria-label={`Hoof trim ${goat.name}`}
                              />
                            </td>
                            <td className="px-2 py-2 align-top text-center">
                              <Checkbox
                                checked={row.cdt}
                                onCheckedChange={(c) => updateRow(goat.id, { cdt: c === true })}
                                aria-label={`CDT shot ${goat.name}`}
                              />
                            </td>
                            <td className="px-2 py-2 align-top text-center">
                              <div className="space-y-1.5 flex flex-col items-center">
                                <Checkbox
                                  checked={row.copperBolus}
                                  onCheckedChange={(c) =>
                                    updateRow(goat.id, { copperBolus: c === true, ...(c === true ? {} : { copperDose: "" }) })
                                  }
                                  aria-label={`Copper bolus ${goat.name}`}
                                />
                                {row.copperBolus && (
                                  <Select
                                    value={row.copperDose || "none"}
                                    onValueChange={(v) => updateRow(goat.id, { copperDose: v === "none" ? "" : v })}
                                  >
                                    <SelectTrigger className="h-8 w-[80px]" aria-label={`Copper bolus dose for ${goat.name}`}>
                                      <SelectValue placeholder="Dose" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="none">—</SelectItem>
                                      {COPPER_BOLUS_DOSES_G.map((g) => (
                                        <SelectItem key={g} value={String(g)}>{g} g</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                )}
                              </div>
                            </td>
                            <td className="px-2 py-2 align-top">
                              <Input
                                className="h-8 w-[90px]"
                                type="number"
                                min={0}
                                step="0.1"
                                value={row.weight}
                                onChange={(e) => updateRow(goat.id, { weight: e.target.value })}
                                aria-label={`Weight for ${goat.name}`}
                              />
                            </td>
                            <td className="px-2 py-2 align-top">
                              <Input
                                className="h-8"
                                placeholder="Notes"
                                value={row.notes}
                                onChange={(e) => updateRow(goat.id, { notes: e.target.value })}
                                aria-label={`Notes for ${goat.name}`}
                              />
                            </td>
                          </tr>
                          {flagged && (
                            <tr className="bg-amber-50/60 dark:bg-amber-950/20">
                              <td colSpan={8} className="px-2 pb-2 pt-0">
                                <label className="flex items-center gap-2 text-xs text-amber-800 dark:text-amber-300 cursor-pointer">
                                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                                  <Checkbox
                                    checked={!row.dewormOptOut}
                                    onCheckedChange={(c) => updateRow(goat.id, { dewormOptOut: c !== true })}
                                  />
                                  <span>
                                    FAMACHA {row.famacha} is at/above your threshold ({famachaThreshold}+) — also log a
                                    deworming for {goat.name}.
                                  </span>
                                </label>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {!isLoading && filteredGoats.length > 0 && (
              <div className="md:hidden space-y-3">
                {filteredGoats.map((goat) => {
                  const row = rowOf(goat.id);
                  const flagged = isFlagged(goat);
                  return (
                    <div
                      key={goat.id}
                      className={`rounded-xl border p-4 space-y-3 ${flagged ? "border-amber-300 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-950/20" : "border-border bg-card"}`}
                    >
                      <div>
                        <p className="font-medium text-foreground">{goat.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {breedLabel(goat.breed)} · {sexLabel(goat.sex)}
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">FAMACHA</Label>
                          <Select
                            value={row.famacha || "none"}
                            onValueChange={(v) => updateRow(goat.id, { famacha: v === "none" ? "" : v })}
                          >
                            <SelectTrigger className="h-9" aria-label={`FAMACHA score for ${goat.name}`}>
                              <SelectValue placeholder="—" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">—</SelectItem>
                              {[1, 2, 3, 4, 5].map((s) => (
                                <SelectItem key={s} value={String(s)}>{s}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Weight {weightUnitLabel(weightUnit)}</Label>
                          <Input
                            className="h-9"
                            type="number"
                            min={0}
                            step="0.1"
                            value={row.weight}
                            onChange={(e) => updateRow(goat.id, { weight: e.target.value })}
                            aria-label={`Weight for ${goat.name}`}
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="flex items-center gap-2 text-sm text-foreground">
                          <Checkbox
                            checked={row.deworm}
                            onCheckedChange={(c) => updateRow(goat.id, { deworm: c === true })}
                            aria-label={`Dewormed ${goat.name}`}
                          />
                          Dewormed
                        </label>
                        {row.deworm && (
                          <div className="grid grid-cols-1 gap-2 pl-6">
                            <Input
                              className="h-9"
                              placeholder="Product (e.g. Cydectin)"
                              value={row.dewormProduct}
                              onChange={(e) => updateRow(goat.id, { dewormProduct: e.target.value })}
                              aria-label={`Dewormer product for ${goat.name}`}
                            />
                            <Input
                              className="h-9"
                              type="number"
                              min={0}
                              step="0.1"
                              placeholder="Dose mL"
                              value={row.dewormDose}
                              onChange={(e) => updateRow(goat.id, { dewormDose: e.target.value })}
                              aria-label={`Dewormer dose for ${goat.name}`}
                            />
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-1 gap-2">
                        <label className="flex items-center gap-2 text-sm text-foreground">
                          <Checkbox
                            checked={row.hoofTrim}
                            onCheckedChange={(c) => updateRow(goat.id, { hoofTrim: c === true })}
                            aria-label={`Hoof trim ${goat.name}`}
                          />
                          Hoof Trim
                        </label>
                        <label className="flex items-center gap-2 text-sm text-foreground">
                          <Checkbox
                            checked={row.cdt}
                            onCheckedChange={(c) => updateRow(goat.id, { cdt: c === true })}
                            aria-label={`CDT shot ${goat.name}`}
                          />
                          CDT
                        </label>
                        <label className="flex items-center gap-2 text-sm text-foreground">
                          <Checkbox
                            checked={row.copperBolus}
                            onCheckedChange={(c) =>
                              updateRow(goat.id, { copperBolus: c === true, ...(c === true ? {} : { copperDose: "" }) })
                            }
                            aria-label={`Copper bolus ${goat.name}`}
                          />
                          Copper Bolus
                        </label>
                        {row.copperBolus && (
                          <div className="pl-6">
                            <Select
                              value={row.copperDose || "none"}
                              onValueChange={(v) => updateRow(goat.id, { copperDose: v === "none" ? "" : v })}
                            >
                              <SelectTrigger className="h-9 w-[120px]" aria-label={`Copper bolus dose for ${goat.name}`}>
                                <SelectValue placeholder="Dose (g)" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">—</SelectItem>
                                {COPPER_BOLUS_DOSES_G.map((g) => (
                                  <SelectItem key={g} value={String(g)}>{g} g</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Notes</Label>
                        <Input
                          className="h-9"
                          placeholder="Notes"
                          value={row.notes}
                          onChange={(e) => updateRow(goat.id, { notes: e.target.value })}
                          aria-label={`Notes for ${goat.name}`}
                        />
                      </div>

                      {flagged && (
                        <label className="flex items-start gap-2 text-xs text-amber-800 dark:text-amber-300 cursor-pointer pt-1 border-t border-amber-200/60 dark:border-amber-800/60">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                          <Checkbox
                            className="mt-0.5"
                            checked={!row.dewormOptOut}
                            onCheckedChange={(c) => updateRow(goat.id, { dewormOptOut: c !== true })}
                          />
                          <span>
                            FAMACHA {row.famacha} is at/above your threshold ({famachaThreshold}+) — also log a
                            deworming for {goat.name}.
                          </span>
                        </label>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-border">
              <span className="text-sm text-muted-foreground">
                {allEvents.length} event{allEvents.length === 1 ? "" : "s"} across {goatsWithData} goat
                {goatsWithData === 1 ? "" : "s"} will be saved.
              </span>
              <Button onClick={submit} disabled={bulkCreate.isPending || allEvents.length === 0}>
                {bulkCreate.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save {allEvents.length} Event{allEvents.length === 1 ? "" : "s"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
