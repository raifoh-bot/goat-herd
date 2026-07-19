import { useEffect, useMemo, useRef, useState } from "react";
import { Printer, Trophy } from "lucide-react";
import {
  getListBreedingsQueryKey,
  getListGoatsQueryKey,
  useListBreedings,
  useListGoats,
} from "@workspace/api-client-react";
import type { Goat, ListGoatsSex, ListGoatsStatus } from "@workspace/api-client-react/src/generated/api.schemas";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ReportHeader } from "@/components/report-header";
import { formatDate } from "@/lib/date";
import { formatAge } from "@/lib/age";
import { breedLabel, BREED_CATALOG } from "@/lib/breeds";
import { deriveKiddingRecord } from "@/lib/kidding";
import { HERD_STATUS_LABELS, sexLabel } from "@/lib/goats";

function shortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return formatDate(new Date(iso), { month: "short", day: "numeric", year: "numeric" });
}

export default function ShowTime() {
  const [statusFilter, setStatusFilter] = useState<ListGoatsStatus | undefined>("on-farm");
  const [sexFilter, setSexFilter] = useState<ListGoatsSex | undefined>(undefined);
  const [breedFilter, setBreedFilter] = useState<string | undefined>(undefined);
  const [selected, setSelected] = useState<Set<Goat["id"]>>(new Set());
  const initializedRef = useRef(false);

  const { data: goats, isLoading } = useListGoats(
    { status: statusFilter, sex: sexFilter },
    { query: { queryKey: getListGoatsQueryKey({ status: statusFilter, sex: sexFilter }) } },
  );
  const { data: breedings, isLoading: breedingsLoading } = useListBreedings({
    query: { queryKey: getListBreedingsQueryKey() },
  });

  const filteredGoats = useMemo(() => {
    const base = goats?.filter((g) => !breedFilter || g.breed === breedFilter) ?? [];
    return [...base].sort((a, b) => a.name.localeCompare(b.name));
  }, [goats, breedFilter]);

  // Default to everything selected the first time goats load.
  useEffect(() => {
    if (!initializedRef.current && goats && goats.length > 0) {
      initializedRef.current = true;
      setSelected(new Set(goats.map((g) => g.id)));
    }
  }, [goats]);

  const selectedGoats = filteredGoats.filter((g) => selected.has(g.id));
  const allSelected = filteredGoats.length > 0 && filteredGoats.every((g) => selected.has(g.id));

  const kiddingByGoat = useMemo(() => {
    const map = new Map<number, ReturnType<typeof deriveKiddingRecord>>();
    if (!breedings) return map;
    for (const g of selectedGoats) {
      if (g.sex === "doe") map.set(g.id, deriveKiddingRecord(g.id, breedings));
    }
    return map;
  }, [breedings, selectedGoats]);

  function toggleGoat(id: Goat["id"]) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        filteredGoats.forEach((g) => next.delete(g.id));
      } else {
        filteredGoats.forEach((g) => next.add(g.id));
      }
      return next;
    });
  }

  const loading = isLoading || breedingsLoading;

  return (
    <Layout>
      {/* Six columns fit comfortably in portrait. */}
      <style>{`@media print { @page { size: letter portrait; margin: 0.5in; } }`}</style>

      <ReportHeader title="Show Time" />

      <div className="no-print mb-8 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-bold text-foreground mb-1">Show Time</h1>
          <p className="text-muted-foreground text-sm">
            Print-ready check-in sheet for shows: one row per goat with barn name, registered name,
            breed, and age, plus each doe's kidding record (times kidded and last kidding date).
          </p>
        </div>
        <Button
          onClick={() => window.print()}
          disabled={selectedGoats.length === 0}
          className="self-start shrink-0 bg-primary text-primary-foreground hover:bg-primary/90 shadow-md"
        >
          <Printer className="mr-2 h-4 w-4" /> Print Sheet
        </Button>
      </div>

      {/* Goat selection controls — hidden when printing. */}
      <div className="no-print mb-8 rounded-xl border border-border bg-card p-4 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <div className="flex flex-wrap gap-2 flex-1">
            <Select value={statusFilter || "all"} onValueChange={(val) => setStatusFilter(val === "all" ? undefined : (val as ListGoatsStatus))}>
              <SelectTrigger className="w-[160px] bg-background/50 border-input">
                <SelectValue placeholder="Herd Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Herd Status</SelectItem>
                {Object.entries(HERD_STATUS_LABELS).map(([slug, label]) => (
                  <SelectItem key={slug} value={slug}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={sexFilter || "all"} onValueChange={(val) => setSexFilter(val === "all" ? undefined : (val as ListGoatsSex))}>
              <SelectTrigger className="w-[140px] bg-background/50 border-input">
                <SelectValue placeholder="Sex" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sexes</SelectItem>
                <SelectItem value="doe">Does</SelectItem>
                <SelectItem value="buck">Bucks</SelectItem>
                <SelectItem value="wether">Wethers</SelectItem>
              </SelectContent>
            </Select>

            <Select value={breedFilter || "all"} onValueChange={(val) => setBreedFilter(val === "all" ? undefined : val)}>
              <SelectTrigger className="w-[170px] bg-background/50 border-input">
                <SelectValue placeholder="Breed" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Breeds</SelectItem>
                {BREED_CATALOG.map((b) => (
                  <SelectItem key={b.slug} value={b.slug}>{b.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" onClick={toggleAll} disabled={filteredGoats.length === 0} className="shrink-0">
            {allSelected ? "Deselect All" : "Select All"}
          </Button>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-10 rounded-lg" />)}
          </div>
        ) : filteredGoats.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No goats match the current filters.</p>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 max-h-72 overflow-y-auto pr-1">
              {filteredGoats.map((goat) => (
                <label
                  key={goat.id}
                  className="flex items-center gap-2.5 rounded-lg border border-border/60 px-3 py-2 text-sm cursor-pointer hover:bg-muted/40 transition-colors"
                >
                  <Checkbox
                    checked={selected.has(goat.id)}
                    onCheckedChange={() => toggleGoat(goat.id)}
                    aria-label={`Include ${goat.name}`}
                  />
                  <span className="min-w-0 flex-1 truncate font-medium text-foreground">{goat.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{breedLabel(goat.breed)} · {sexLabel(goat.sex)}</span>
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {selectedGoats.length} of {filteredGoats.length} goat{filteredGoats.length !== 1 ? "s" : ""} selected for the sheet.
            </p>
          </>
        )}
      </div>

      {/* Sheet — both the on-screen preview and the printed output. */}
      {selectedGoats.length === 0 ? (
        <div className="no-print flex flex-col items-center justify-center py-16 text-center bg-card/50 rounded-xl border border-dashed border-primary/20">
          <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Trophy className="h-7 w-7 text-primary/60" />
          </div>
          <h3 className="text-lg font-serif font-medium text-foreground mb-1">No goats selected</h3>
          <p className="text-sm text-muted-foreground max-w-md">Select at least one goat above to preview and print the sheet.</p>
        </div>
      ) : loading ? (
        <Skeleton className="h-64 w-full rounded-2xl" />
      ) : (
        <div className="rounded-2xl border border-primary/10 shadow-md bg-card overflow-hidden print:border-0 print:shadow-none print:rounded-none print:bg-transparent">
          <div className="px-4 pt-4 pb-2 print:px-0 flex flex-wrap items-end justify-between gap-x-8 gap-y-2 text-sm text-foreground">
            <div className="font-medium">
              Show / Event: <span className="inline-block w-56 border-b border-foreground/60 align-baseline">&nbsp;</span>
            </div>
            <div className="font-medium">
              Date: <span className="inline-block w-40 border-b border-foreground/60 align-baseline">&nbsp;</span>
            </div>
          </div>

          <div className="overflow-x-auto print:overflow-visible">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr>
                  <th className="border border-foreground/30 bg-muted/60 px-2 py-2 text-left font-semibold text-foreground whitespace-nowrap">Barn Name</th>
                  <th className="border border-foreground/30 bg-muted/60 px-2 py-2 text-left font-semibold text-foreground whitespace-nowrap">Registered Name</th>
                  <th className="border border-foreground/30 bg-muted/60 px-2 py-2 text-left font-semibold text-foreground whitespace-nowrap">Breed</th>
                  <th className="border border-foreground/30 bg-muted/60 px-2 py-2 text-left font-semibold text-foreground whitespace-nowrap">Age</th>
                  <th className="border border-foreground/30 bg-muted/60 px-2 py-2 text-left font-semibold text-foreground whitespace-nowrap">Times Kidded</th>
                  <th className="border border-foreground/30 bg-muted/60 px-2 py-2 text-left font-semibold text-foreground whitespace-nowrap">Last Kidding</th>
                </tr>
              </thead>
              <tbody>
                {selectedGoats.map((goat, i) => {
                  const kidding = kiddingByGoat.get(goat.id);
                  return (
                    <tr key={goat.id} className={`break-inside-avoid ${i % 2 === 1 ? "bg-muted/30" : ""}`}>
                      <td className="border border-foreground/30 px-2 py-1.5 font-medium text-foreground whitespace-nowrap">{goat.name}</td>
                      <td className="border border-foreground/30 px-2 py-1.5 text-muted-foreground print:text-foreground whitespace-nowrap">{goat.registeredName || "—"}</td>
                      <td className="border border-foreground/30 px-2 py-1.5 text-muted-foreground print:text-foreground whitespace-nowrap">{breedLabel(goat.breed)}</td>
                      <td className="border border-foreground/30 px-2 py-1.5 text-muted-foreground print:text-foreground whitespace-nowrap">{goat.dateOfBirth ? formatAge(goat.dateOfBirth) : "—"}</td>
                      <td className="border border-foreground/30 px-2 py-1.5 text-foreground whitespace-nowrap">
                        {goat.sex === "doe" ? (kidding?.timesKidded ?? 0) : "—"}
                      </td>
                      <td className="border border-foreground/30 px-2 py-1.5 text-foreground whitespace-nowrap">
                        {goat.sex === "doe" ? shortDate(kidding?.lastKiddingDate) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="px-4 py-3 print:px-0 print:py-2 text-xs text-muted-foreground print:text-foreground">
            {selectedGoats.length} goat{selectedGoats.length !== 1 ? "s" : ""} on this sheet
          </div>
        </div>
      )}
    </Layout>
  );
}
