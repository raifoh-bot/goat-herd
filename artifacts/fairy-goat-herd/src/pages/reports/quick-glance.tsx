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

type SortKey = "name" | "dateOfBirth" | "age" | "tattoos" | "damName" | "sireName";
type SortDir = "asc" | "desc";

const COLUMNS: { key: SortKey; label: string; width?: string }[] = [
  { key: "name",        label: "Barn Name",     width: "w-40" },
  { key: "dateOfBirth", label: "Date of Birth", width: "w-32" },
  { key: "age",         label: "Age",           width: "w-28" },
  { key: "tattoos",     label: "Tattoos",       width: "" },
  { key: "damName",     label: "Dam",           width: "" },
  { key: "sireName",    label: "Sire",          width: "" },
];

const TATTOO_FIELDS: { key: keyof Goat; label: string }[] = [
  { key: "rightEarTattoo", label: "RE" },
  { key: "leftEarTattoo", label: "LE" },
  { key: "rightTailTattoo", label: "RT" },
  { key: "leftTailTattoo", label: "LT" },
  { key: "centerTailTattoo", label: "CT" },
];

/**
 * Combined tattoo string used for sorting: the left-ear/left-tail side
 * usually carries the year letter + birth order, so sorting on the joined
 * uppercase string groups litters together and exposes gaps in birth order.
 */
function tattooSortValue(goat: Goat): string {
  return TATTOO_FIELDS
    .map((f) => ((goat[f.key] as string | null | undefined) ?? "").trim().toUpperCase())
    .filter(Boolean)
    .join(" ");
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
    if (key === "tattoos") {
      aVal = tattooSortValue(a);
      bVal = tattooSortValue(b);
      // Goats with no tattoos sort last so missing tattoos stand out together.
      if (!aVal && bVal) return 1;
      if (aVal && !bVal) return -1;
    } else {
      aVal = (a[key] as string | null | undefined) ?? "";
      bVal = (b[key] as string | null | undefined) ?? "";
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

function TattooCell({ goat }: { goat: Goat }) {
  const tattoos = TATTOO_FIELDS
    .map((f) => ({ label: f.label, value: goat[f.key] as string | null | undefined }))
    .filter((t) => t.value);

  if (tattoos.length === 0) {
    return (
      <td className="px-4 py-3 align-top">
        <span className="text-xs font-medium text-destructive/80">None recorded</span>
      </td>
    );
  }

  return (
    <td className="px-4 py-3 align-top text-muted-foreground">
      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
        {tattoos.map((t) => (
          <span key={t.label} className="whitespace-nowrap text-xs">
            {t.label} <span className="font-mono uppercase text-foreground">{t.value}</span>
          </span>
        ))}
      </div>
    </td>
  );
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
  const missingTattoos = sorted.filter((g) => tattooSortValue(g) === "").length;

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
                    <TattooCell goat={goat} />
                    <td className="px-4 py-3 text-muted-foreground align-top">{goat.damName || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground align-top">{goat.sireName || "—"}</td>
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
