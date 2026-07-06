import { useEffect, useMemo, useRef, useState } from "react";
import { Printer, ClipboardList } from "lucide-react";
import { getListGoatsQueryKey, useListGoats } from "@workspace/api-client-react";
import type { Goat, ListGoatsSex, ListGoatsStatus } from "@workspace/api-client-react/src/generated/api.schemas";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ReportHeader } from "@/components/report-header";
import { formatAge } from "@/lib/age";
import { breedLabel, BREED_CATALOG } from "@/lib/breeds";

const herdStatusLabels: Record<string, string> = {
  "on-farm": "On Farm",
  "first-freshener": "First Freshener",
  leased: "Leased",
  retired: "Retired",
  "sold-registered": "Sold-Registered",
  "sold-not-registered": "Sold-Not Registered",
  dead: "Dead",
};

function sexLabel(sex: string | null | undefined) {
  if (sex === "doe") return "Doe";
  if (sex === "buck") return "Buck";
  if (sex === "wether") return "Wether";
  return "—";
}

/** Blank task columns the farmer fills in by hand while working the herd. */
const TASK_COLUMNS = [
  { id: "famacha", label: "FAMACHA (1–5)", width: "print:w-[0.9in]" },
  { id: "dewormed", label: "Dewormed (Y/N + product/dose)", width: "print:w-[1.4in]" },
  { id: "hoof-trim", label: "Hoof Trim", width: "print:w-[0.7in]" },
  { id: "cdt", label: "CDT", width: "print:w-[0.6in]" },
  { id: "copper-bolus", label: "Copper Bolus", width: "print:w-[0.7in]" },
  { id: "weight", label: "Weight", width: "print:w-[0.8in]" },
  { id: "notes", label: "Notes", width: "" },
] as const;

type TaskColumnId = (typeof TASK_COLUMNS)[number]["id"];

export default function BarnWorksheet() {
  const [statusFilter, setStatusFilter] = useState<ListGoatsStatus | undefined>("on-farm");
  const [sexFilter, setSexFilter] = useState<ListGoatsSex | undefined>(undefined);
  const [breedFilter, setBreedFilter] = useState<string | undefined>(undefined);
  const [selected, setSelected] = useState<Set<Goat["id"]>>(new Set());
  const [selectedColumns, setSelectedColumns] = useState<Set<TaskColumnId>>(
    () => new Set(TASK_COLUMNS.map((c) => c.id)),
  );
  const initializedRef = useRef(false);

  const visibleColumns = TASK_COLUMNS.filter((c) => selectedColumns.has(c.id));

  function toggleColumn(id: TaskColumnId) {
    setSelectedColumns((prev) => {
      // Keep at least one task column selected.
      if (prev.has(id) && prev.size === 1) return prev;
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const { data: goats, isLoading } = useListGoats(
    { status: statusFilter, sex: sexFilter },
    { query: { queryKey: getListGoatsQueryKey({ status: statusFilter, sex: sexFilter }) } },
  );

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

  return (
    <Layout>
      {/* Landscape orientation so all task columns fit on paper. Scoped to
          this page by only mounting the style while the worksheet is open. */}
      <style>{`@media print { @page { size: letter landscape; margin: 0.5in; } }`}</style>

      <ReportHeader title="Barn Worksheet" />

      <div className="no-print mb-8 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-bold text-foreground mb-1">Barn Worksheet</h1>
          <p className="text-muted-foreground text-sm">
            Pick the goats for your work day, print the sheet, and mark off each task by hand in the barn or field.
          </p>
        </div>
        <Button
          onClick={() => window.print()}
          disabled={selectedGoats.length === 0}
          className="self-start shrink-0 bg-primary text-primary-foreground hover:bg-primary/90 shadow-md"
        >
          <Printer className="mr-2 h-4 w-4" /> Print Worksheet
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
                {Object.entries(herdStatusLabels).map(([slug, label]) => (
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
              {selectedGoats.length} of {filteredGoats.length} goat{filteredGoats.length !== 1 ? "s" : ""} selected for the worksheet.
            </p>
          </>
        )}
      </div>

      {/* Task column controls — hidden when printing. */}
      <div className="no-print mb-8 rounded-xl border border-border bg-card p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-foreground mb-1">Task Columns</h2>
        <p className="text-xs text-muted-foreground mb-3">
          Pick the columns for today's tasks. Unchecked columns are left off the sheet so the rest get wider writing space.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
          {TASK_COLUMNS.map((col) => {
            const isOnlySelected = selectedColumns.has(col.id) && selectedColumns.size === 1;
            return (
              <label
                key={col.id}
                className={`flex items-center gap-2.5 rounded-lg border border-border/60 px-3 py-2 text-sm transition-colors ${
                  isOnlySelected ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-muted/40"
                }`}
              >
                <Checkbox
                  checked={selectedColumns.has(col.id)}
                  onCheckedChange={() => toggleColumn(col.id)}
                  disabled={isOnlySelected}
                  aria-label={`Include ${col.label} column`}
                />
                <span className="min-w-0 flex-1 truncate font-medium text-foreground">{col.label}</span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Worksheet — this is both the on-screen preview and the printed output. */}
      {selectedGoats.length === 0 ? (
        <div className="no-print flex flex-col items-center justify-center py-16 text-center bg-card/50 rounded-xl border border-dashed border-primary/20">
          <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <ClipboardList className="h-7 w-7 text-primary/60" />
          </div>
          <h3 className="text-lg font-serif font-medium text-foreground mb-1">No goats selected</h3>
          <p className="text-sm text-muted-foreground max-w-md">Select at least one goat above to preview and print the worksheet.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-primary/10 shadow-md bg-card overflow-hidden print:border-0 print:shadow-none print:rounded-none print:bg-transparent">
          <div className="px-4 pt-4 pb-2 print:px-0 flex flex-wrap items-end justify-between gap-x-8 gap-y-2 text-sm text-foreground">
            <div className="font-medium">
              Work Day Date: <span className="inline-block w-40 border-b border-foreground/60 align-baseline">&nbsp;</span>
            </div>
            <div className="font-medium">
              Recorded by: <span className="inline-block w-48 border-b border-foreground/60 align-baseline">&nbsp;</span>
            </div>
          </div>

          <div className="overflow-x-auto print:overflow-visible">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr>
                  <th className="border border-foreground/30 bg-muted/60 px-2 py-2 text-left font-semibold text-foreground whitespace-nowrap">Goat</th>
                  <th className="border border-foreground/30 bg-muted/60 px-2 py-2 text-left font-semibold text-foreground whitespace-nowrap">Breed</th>
                  <th className="border border-foreground/30 bg-muted/60 px-2 py-2 text-left font-semibold text-foreground whitespace-nowrap">Sex</th>
                  <th className="border border-foreground/30 bg-muted/60 px-2 py-2 text-left font-semibold text-foreground whitespace-nowrap">Age</th>
                  {visibleColumns.map((col) => (
                    <th key={col.id} className={`border border-foreground/30 bg-muted/60 px-2 py-2 text-left font-semibold text-foreground ${col.width}`}>
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {selectedGoats.map((goat, i) => (
                  <tr key={goat.id} className={`h-14 print:h-[0.55in] break-inside-avoid ${i % 2 === 1 ? "bg-muted/30" : ""}`}>
                    <td className="border border-foreground/30 px-2 py-1 font-medium text-foreground align-top whitespace-nowrap">{goat.name}</td>
                    <td className="border border-foreground/30 px-2 py-1 text-muted-foreground print:text-foreground align-top whitespace-nowrap">{breedLabel(goat.breed)}</td>
                    <td className="border border-foreground/30 px-2 py-1 text-muted-foreground print:text-foreground align-top whitespace-nowrap">{sexLabel(goat.sex)}</td>
                    <td className="border border-foreground/30 px-2 py-1 text-muted-foreground print:text-foreground align-top whitespace-nowrap">
                      {goat.dateOfBirth ? formatAge(goat.dateOfBirth) : "—"}
                    </td>
                    {visibleColumns.map((col) => (
                      <td key={col.id} className="border border-foreground/30 px-2 py-1" />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="px-4 py-3 print:px-0 print:py-2 text-xs text-muted-foreground print:text-foreground">
            {selectedGoats.length} goat{selectedGoats.length !== 1 ? "s" : ""} on this worksheet
          </div>
        </div>
      )}
    </Layout>
  );
}
