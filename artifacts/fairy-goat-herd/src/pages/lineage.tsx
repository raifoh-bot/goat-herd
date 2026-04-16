import { useState } from "react";
import { Link } from "wouter";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { useListGoats } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Skeleton } from "@/components/ui/skeleton";
import { formatAge } from "@/lib/age";
import type { Goat } from "@workspace/api-client-react/src/generated/api.schemas";

type SortKey = "name" | "age" | "damName" | "sireName" | "maternalGranddamName" | "maternalGrandsireName" | "paternalGranddamName" | "paternalGrandsireName";
type SortDir = "asc" | "desc";

const COLUMNS: { key: SortKey; label: string; width?: string }[] = [
  { key: "name",                    label: "Barn Name",           width: "w-36" },
  { key: "age",                     label: "Age",                 width: "w-28" },
  { key: "damName",                 label: "Dam",                 width: "" },
  { key: "sireName",                label: "Sire",                width: "" },
  { key: "maternalGranddamName",    label: "Maternal Granddam",   width: "" },
  { key: "maternalGrandsireName",   label: "Maternal Grandsire",  width: "" },
  { key: "paternalGranddamName",    label: "Paternal Granddam",   width: "" },
  { key: "paternalGrandsireName",   label: "Paternal Grandsire",  width: "" },
];

function sortGoats(goats: Goat[], key: SortKey, dir: SortDir): Goat[] {
  return [...goats].sort((a, b) => {
    let aVal: string | number = "";
    let bVal: string | number = "";

    if (key === "age") {
      aVal = a.dateOfBirth ? new Date(a.dateOfBirth).getTime() : 0;
      bVal = b.dateOfBirth ? new Date(b.dateOfBirth).getTime() : 0;
      return dir === "asc" ? bVal - aVal : aVal - bVal;
    }

    aVal = (a[key] as string | null | undefined) ?? "";
    bVal = (b[key] as string | null | undefined) ?? "";
    const cmp = (aVal as string).localeCompare(bVal as string);
    return dir === "asc" ? cmp : -cmp;
  });
}

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <ChevronsUpDown className="h-3.5 w-3.5 opacity-30" />;
  return sortDir === "asc"
    ? <ChevronUp className="h-3.5 w-3.5 text-primary" />
    : <ChevronDown className="h-3.5 w-3.5 text-primary" />;
}

export default function LineageReports() {
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const { data: goats, isLoading } = useListGoats();

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const sorted = goats ? sortGoats(goats, sortKey, sortDir) : [];

  return (
    <Layout>
      <div className="mb-8">
        <h1 className="font-serif text-3xl font-bold text-foreground mb-1">Lineage Reports</h1>
        <p className="text-muted-foreground text-sm">Full pedigree listing for every goat in the herd. Click any column header to sort.</p>
      </div>

      <div className="rounded-2xl border border-primary/10 shadow-md bg-card overflow-hidden">
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
                    <td className="px-4 py-3 font-medium">
                      <Link href={`/goats/${goat.id}`} className="text-foreground hover:text-primary transition-colors">
                        {goat.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      {goat.dateOfBirth ? formatAge(goat.dateOfBirth) : "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{goat.damName || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{goat.sireName || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{goat.maternalGranddamName || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{goat.maternalGrandsireName || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{goat.paternalGranddamName || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{goat.paternalGrandsireName || "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {!isLoading && sorted.length > 0 && (
          <div className="px-4 py-3 border-t border-border/50 bg-muted/20 text-xs text-muted-foreground">
            {sorted.length} goat{sorted.length !== 1 ? "s" : ""}
          </div>
        )}
      </div>
    </Layout>
  );
}
