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

type SortKey = "name" | "age" | "dateOfBirth" | "damName" | "sireName" | "maternalGranddamName" | "maternalGrandsireName" | "paternalGranddamName" | "paternalGrandsireName";
type SortDir = "asc" | "desc";

const COLUMNS: { key: SortKey; label: string; width?: string }[] = [
  { key: "name",                    label: "Barn Name",           width: "w-36" },
  { key: "dateOfBirth",             label: "Date of Birth",       width: "w-32" },
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

    if (key === "age" || key === "dateOfBirth") {
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

function AncestorCell({ name, regNo }: { name?: string | null; regNo?: string | null }) {
  return (
    <td className="px-4 py-3 text-muted-foreground align-top">
      <div>{name || "—"}</div>
      {regNo && <div className="text-xs text-muted-foreground/70">Reg: {regNo}</div>}
    </td>
  );
}

const TATTOO_FIELDS: { key: keyof Goat; label: string }[] = [
  { key: "rightEarTattoo", label: "RE" },
  { key: "leftEarTattoo", label: "LE" },
  { key: "rightTailTattoo", label: "RT" },
  { key: "leftTailTattoo", label: "LT" },
  { key: "centerTailTattoo", label: "CT" },
];

function Identification({ goat }: { goat: Goat }) {
  const tattoos = TATTOO_FIELDS
    .map((f) => ({ label: f.label, value: goat[f.key] as string | null | undefined }))
    .filter((t) => t.value);

  if (tattoos.length === 0 && !goat.eidNumber) return null;

  return (
    <div className="mt-1 space-y-0.5 text-xs text-muted-foreground/70">
      {tattoos.length > 0 && (
        <div>
          Tattoo:{" "}
          {tattoos.map((t, i) => (
            <span key={t.label}>
              {i > 0 && " · "}
              {t.label} <span className="font-mono uppercase">{t.value}</span>
            </span>
          ))}
        </div>
      )}
      {goat.eidNumber && (
        <div className="break-all">
          EID: <span className="font-mono">{goat.eidNumber}</span>
        </div>
      )}
    </div>
  );
}

export default function LineageReports() {
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

  return (
    <Layout>
      <ReportHeader title="Lineage Report" />

      <div className="mb-8 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-bold text-foreground mb-1">Lineage Reports</h1>
          <p className="text-muted-foreground text-sm">Full pedigree listing for every goat in the herd. Click any column header to sort.</p>
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
                      <Identification goat={goat} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      {formatDate(goat.dateOfBirth, { month: "short", day: "numeric", year: "numeric" })}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      {goat.dateOfBirth ? formatAge(goat.dateOfBirth) : "—"}
                    </td>
                    <AncestorCell name={goat.damName} regNo={goat.damRegNo} />
                    <AncestorCell name={goat.sireName} regNo={goat.sireRegNo} />
                    <AncestorCell name={goat.maternalGranddamName} regNo={goat.maternalGranddamRegNo} />
                    <AncestorCell name={goat.maternalGrandsireName} regNo={goat.maternalGrandsireRegNo} />
                    <AncestorCell name={goat.paternalGranddamName} regNo={goat.paternalGranddamRegNo} />
                    <AncestorCell name={goat.paternalGrandsireName} regNo={goat.paternalGrandsireRegNo} />
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
