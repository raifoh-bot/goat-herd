import { useState } from "react";
import { Link } from "wouter";
import { ChevronUp, ChevronDown, ChevronsUpDown, Printer } from "lucide-react";
import { useListGoats } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ReportHeader } from "@/components/report-header";
import { formatAge } from "@/lib/age";
import { formatDate } from "@/lib/date";
import type { Goat } from "@workspace/api-client-react/src/generated/api.schemas";

type TattooKey =
  | "rightEarTattoo"
  | "leftEarTattoo"
  | "rightTailTattoo"
  | "leftTailTattoo"
  | "centerTailTattoo";

type SortKey = "name" | "dateOfBirth" | "age" | TattooKey;
type SortDir = "asc" | "desc";

const TATTOO_COLUMNS: { key: TattooKey; label: string }[] = [
  { key: "rightEarTattoo", label: "Right Ear" },
  { key: "leftEarTattoo", label: "Left Ear" },
  { key: "rightTailTattoo", label: "Right Tail" },
  { key: "leftTailTattoo", label: "Left Tail" },
  { key: "centerTailTattoo", label: "Center Tail" },
];

const COLUMNS: { key: SortKey; label: string; width?: string }[] = [
  { key: "name",        label: "Barn Name",     width: "w-40" },
  { key: "dateOfBirth", label: "Date of Birth", width: "w-32" },
  { key: "age",         label: "Age",           width: "w-28" },
  ...TATTOO_COLUMNS,
];

const TATTOO_KEYS = TATTOO_COLUMNS.map((c) => c.key);

function tattooValue(goat: Goat, key: TattooKey): string {
  return ((goat[key] as string | null | undefined) ?? "").trim().toUpperCase();
}

function hasAnyTattoo(goat: Goat): boolean {
  return TATTOO_KEYS.some((k) => tattooValue(goat, k) !== "");
}

function sortGoats(goats: Goat[], key: SortKey, dir: SortDir): Goat[] {
  return [...goats].sort((a, b) => {
    if (key === "age" || key === "dateOfBirth") {
      const aVal = a.dateOfBirth ? new Date(a.dateOfBirth).getTime() : 0;
      const bVal = b.dateOfBirth ? new Date(b.dateOfBirth).getTime() : 0;
      return dir === "asc" ? bVal - aVal : aVal - bVal;
    }

    let aVal: string;
    let bVal: string;
    if (key === "name") {
      aVal = a.name ?? "";
      bVal = b.name ?? "";
    } else {
      aVal = tattooValue(a, key);
      bVal = tattooValue(b, key);
      // Goats missing this tattoo sort last so gaps stand out together.
      if (!aVal && bVal) return 1;
      if (aVal && !bVal) return -1;
    }
    const cmp = aVal.localeCompare(bVal, undefined, { numeric: true });
    return dir === "asc" ? cmp : -cmp;
  });
}

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <ChevronsUpDown className="h-3.5 w-3.5 opacity-30" />;
  return sortDir === "asc"
    ? <ChevronUp className="h-3.5 w-3.5 text-primary" />
    : <ChevronDown className="h-3.5 w-3.5 text-primary" />;
}

export default function QuickGlanceReport() {
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const { data: goats, isLoading } = useListGoats({ status: "on-farm" });

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const sorted = goats ? sortGoats(goats, sortKey, sortDir) : [];
  const missingTattoos = sorted.filter((g) => !hasAnyTattoo(g)).length;

  return (
    <Layout>
      <ReportHeader title="Quick Glance" />

      <div className="mb-8 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-bold text-foreground mb-1">Quick Glance</h1>
          <p className="text-muted-foreground text-sm">
            One row per on-farm goat to double-check tattoos and birth order. Click any column header to sort.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => window.print()}
          className="no-print self-start shrink-0"
        >
          <Printer className="mr-2 h-4 w-4" /> Print / Export
        </Button>
      </div>

      <div className="rounded-2xl border border-primary/10 shadow-md bg-card overflow-hidden print:border-0 print:shadow-none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                {COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    className={`px-4 py-3 text-left font-medium text-muted-foreground cursor-pointer select-none whitespace-nowrap hover:text-foreground transition-colors ${col.width ?? ""}`}
                    onClick={() => handleSort(col.key)}
                  >
                    <span className="flex items-center gap-1.5">
                      {col.label}
                      <SortIcon col={col.key} sortKey={sortKey} sortDir={sortDir} />
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b border-border/50">
                    {COLUMNS.map((col) => (
                      <td key={col.key} className="px-4 py-3">
                        <Skeleton className="h-4 w-full max-w-[120px]" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : sorted.length === 0 ? (
                <tr>
                  <td colSpan={COLUMNS.length} className="px-4 py-12 text-center text-muted-foreground">
                    No goats in the herd yet.
                  </td>
                </tr>
              ) : (
                sorted.map((goat) => (
                  <tr key={goat.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-medium align-top">
                      <Link href={`/goats/${goat.id}`} className="text-foreground hover:text-primary transition-colors">
                        {goat.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap align-top">
                      {formatDate(goat.dateOfBirth, { month: "short", day: "numeric", year: "numeric" })}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap align-top">
                      {goat.dateOfBirth ? formatAge(goat.dateOfBirth) : "—"}
                    </td>
                    {TATTOO_COLUMNS.map((col) => {
                      const value = tattooValue(goat, col.key);
                      return (
                        <td key={col.key} className="px-4 py-3 align-top whitespace-nowrap">
                          {value ? (
                            <span className="font-mono uppercase text-foreground">{value}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {!isLoading && sorted.length > 0 && (
          <div className="px-4 py-3 border-t border-border/50 bg-muted/20 text-xs text-muted-foreground">
            {sorted.length} goat{sorted.length !== 1 ? "s" : ""}
            {missingTattoos > 0 && (
              <span className="ml-2 text-destructive/80">
                · {missingTattoos} missing tattoo{missingTattoos !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
