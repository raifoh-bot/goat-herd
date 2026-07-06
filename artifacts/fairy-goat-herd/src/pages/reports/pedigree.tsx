import { useMemo } from "react";
import { useLocation, useSearch } from "wouter";
import { Award, Printer } from "lucide-react";
import {
  useGetGoat,
  useListGoats,
  useListBreedings,
  getGetGoatQueryKey,
  getListBreedingsQueryKey,
} from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ReportHeader } from "@/components/report-header";
import { breedLabels } from "@/lib/breeds";
import { formatAge } from "@/lib/age";
import { formatDate } from "@/lib/date";
import {
  deriveKiddingRecord,
  deriveKiddingHistory,
  capKiddingHistory,
  type KiddingRecord,
  type KiddingHistoryRow,
} from "@/lib/kidding";
import type { Goat } from "@workspace/api-client-react/src/generated/api.schemas";

const TATTOO_FIELDS: { key: keyof Goat; label: string }[] = [
  { key: "rightEarTattoo", label: "Right Ear" },
  { key: "leftEarTattoo", label: "Left Ear" },
  { key: "rightTailTattoo", label: "Right Tail" },
  { key: "leftTailTattoo", label: "Left Tail" },
  { key: "centerTailTattoo", label: "Center Tail" },
];

function sexLabel(sex: Goat["sex"]): string {
  if (sex === "doe") return "Doe";
  if (sex === "buck") return "Buck";
  if (sex === "wether") return "Wether";
  return "—";
}

/** A single ancestor box in the pedigree tree. */
function AncestorBox({
  relation,
  name,
  regNo,
}: {
  relation: string;
  name?: string | null;
  regNo?: string | null;
}) {
  return (
    <div className="flex-1 rounded-lg border border-border bg-card/50 px-4 py-3 print:rounded-none print:border-foreground/30">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">{relation}</div>
      <div className={`text-sm font-medium ${name ? "text-foreground" : "text-muted-foreground italic"}`}>
        {name || "Not recorded"}
      </div>
      <div className="text-xs text-muted-foreground min-h-4">{regNo ? `Reg: ${regNo}` : ""}</div>
    </div>
  );
}

function CertificateSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-24 w-full rounded-xl" />
      <Skeleton className="h-64 w-full rounded-xl" />
      <Skeleton className="h-32 w-full rounded-xl" />
    </div>
  );
}

/** The printable one-page certificate body for a single goat. */
function Certificate({
  goat,
  kiddingRecord,
  kiddingHistory,
}: {
  goat: Goat;
  kiddingRecord?: KiddingRecord | null;
  kiddingHistory?: KiddingHistoryRow[] | null;
}) {
  const tattoos = TATTOO_FIELDS
    .map((f) => ({ label: f.label, value: goat[f.key] as string | null | undefined }))
    .filter((t) => t.value);

  const cappedHistory = kiddingHistory ? capKiddingHistory(kiddingHistory) : null;

  const details: { label: string; value: string }[] = [
    { label: "Breed", value: breedLabels[goat.breed] ?? goat.breed },
    { label: "Sex", value: sexLabel(goat.sex) },
    {
      label: "Date of Birth",
      value: goat.dateOfBirth
        ? formatDate(goat.dateOfBirth, { month: "long", day: "numeric", year: "numeric" })
        : "—",
    },
    { label: "Age", value: goat.dateOfBirth ? formatAge(goat.dateOfBirth) : "—" },
  ];

  return (
    <div className="rounded-2xl border border-primary/10 shadow-md bg-card overflow-hidden print:border-0 print:shadow-none print:rounded-none">
      <div className="p-6 sm:p-8 space-y-8 print:p-0">
        {/* Animal identity */}
        <div className="text-center border-b-2 border-foreground/10 pb-6 print:border-foreground/30">
          <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-2">
            Pedigree Certificate
          </div>
          <h2 className="font-serif text-3xl font-bold text-foreground">{goat.name}</h2>
          {goat.registeredName && (
            <p className="mt-1 text-base italic text-muted-foreground">{goat.registeredName}</p>
          )}
          {goat.adgaId && (
            <p className="mt-1 text-sm font-mono text-muted-foreground">ADGA #{goat.adgaId}</p>
          )}
        </div>

        {/* Details */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {details.map((d) => (
            <div key={d.label} className="text-center">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{d.label}</div>
              <div className="text-sm font-medium text-foreground">{d.value}</div>
            </div>
          ))}
        </div>

        {/* Kidding record (does only) */}
        {goat.sex === "doe" && kiddingRecord && (
          <div>
            <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-3 border-b border-border pb-1">
              Kidding Record
            </h3>
            <div className="flex flex-wrap gap-3">
              <div className="rounded-lg border border-border bg-muted/30 px-4 py-2 text-center print:rounded-none print:border-foreground/30 print:bg-transparent">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">
                  Times Kidded
                </div>
                <div className="font-semibold text-foreground">{kiddingRecord.timesKidded}</div>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 px-4 py-2 text-center print:rounded-none print:border-foreground/30 print:bg-transparent">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">
                  Last Kidding
                </div>
                <div
                  className={
                    kiddingRecord.lastKiddingDate
                      ? "font-semibold text-foreground"
                      : "text-sm italic text-muted-foreground"
                  }
                >
                  {kiddingRecord.lastKiddingDate
                    ? formatDate(kiddingRecord.lastKiddingDate, {
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      })
                    : "None recorded"}
                </div>
              </div>
            </div>
            {cappedHistory && cappedHistory.visible.length > 0 && (
              <table className="mt-3 w-full border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border print:border-foreground/30">
                    <th className="py-1 pr-3 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      Date
                    </th>
                    <th className="py-1 pr-3 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      Sire
                    </th>
                    <th className="py-1 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      Kids Born
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {cappedHistory.visible.map((row) => (
                    <tr
                      key={row.breedingId}
                      className="border-b border-border/50 last:border-b-0 print:border-foreground/20"
                    >
                      <td className="py-1 pr-3 text-foreground">
                        {row.date
                          ? formatDate(row.date, { month: "short", day: "numeric", year: "numeric" })
                          : "—"}
                      </td>
                      <td
                        className={`py-1 pr-3 ${row.sireName ? "text-foreground" : "italic text-muted-foreground"}`}
                      >
                        {row.sireName ?? "Not recorded"}
                      </td>
                      <td
                        className={`py-1 ${row.kidsSummary === "Not recorded" ? "italic text-muted-foreground" : "text-foreground"}`}
                      >
                        {row.kidsSummary}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {cappedHistory && cappedHistory.hiddenCount > 0 && (
              <p className="mt-1.5 text-[10px] italic text-muted-foreground">
                …and {cappedHistory.hiddenCount} earlier{" "}
                {cappedHistory.hiddenCount === 1 ? "kidding" : "kiddings"} (
                {kiddingRecord?.timesKidded ?? cappedHistory.visible.length + cappedHistory.hiddenCount}{" "}
                total)
              </p>
            )}
          </div>
        )}

        {/* Identification */}
        {(tattoos.length > 0 || goat.eidNumber) && (
          <div>
            <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-3 border-b border-border pb-1">
              Identification
            </h3>
            <div className="flex flex-wrap gap-3">
              {tattoos.map((t) => (
                <div
                  key={t.label}
                  className="rounded-lg border border-border bg-muted/30 px-4 py-2 text-center print:rounded-none print:border-foreground/30 print:bg-transparent"
                >
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">
                    {t.label} Tattoo
                  </div>
                  <div className="font-mono font-semibold uppercase text-foreground">{t.value}</div>
                </div>
              ))}
              {goat.eidNumber && (
                <div className="rounded-lg border border-border bg-muted/30 px-4 py-2 text-center print:rounded-none print:border-foreground/30 print:bg-transparent">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">
                    Microchip / EID
                  </div>
                  <div className="font-mono font-semibold text-foreground break-all">{goat.eidNumber}</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Ancestry tree */}
        <div>
          <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-3 border-b border-border pb-1">
            Ancestry
          </h3>
          <div className="space-y-4">
            {/* Dam side */}
            <div className="flex flex-col sm:flex-row gap-3 sm:items-stretch">
              <div className="sm:w-1/2 flex">
                <AncestorBox relation="Dam" name={goat.damName} regNo={goat.damRegNo} />
              </div>
              <div className="sm:w-1/2 flex flex-col gap-3">
                <AncestorBox
                  relation="Maternal Granddam"
                  name={goat.maternalGranddamName}
                  regNo={goat.maternalGranddamRegNo}
                />
                <AncestorBox
                  relation="Maternal Grandsire"
                  name={goat.maternalGrandsireName}
                  regNo={goat.maternalGrandsireRegNo}
                />
              </div>
            </div>
            {/* Sire side */}
            <div className="flex flex-col sm:flex-row gap-3 sm:items-stretch">
              <div className="sm:w-1/2 flex">
                <AncestorBox relation="Sire" name={goat.sireName} regNo={goat.sireRegNo} />
              </div>
              <div className="sm:w-1/2 flex flex-col gap-3">
                <AncestorBox
                  relation="Paternal Granddam"
                  name={goat.paternalGranddamName}
                  regNo={goat.paternalGranddamRegNo}
                />
                <AncestorBox
                  relation="Paternal Grandsire"
                  name={goat.paternalGrandsireName}
                  regNo={goat.paternalGrandsireRegNo}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PedigreeCertificate() {
  const search = useSearch();
  const [location, setLocation] = useLocation();

  const selectedId = useMemo(() => {
    const raw = new URLSearchParams(search).get("goat");
    const parsed = raw ? parseInt(raw, 10) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }, [search]);

  const { data: goats, isLoading: goatsLoading } = useListGoats();
  const sortedGoats = useMemo(
    () => (goats ? [...goats].sort((a, b) => a.name.localeCompare(b.name)) : []),
    [goats],
  );

  const { data: goat, isLoading: goatLoading, isError } = useGetGoat(selectedId ?? 0, {
    query: {
      enabled: selectedId !== null,
      queryKey: getGetGoatQueryKey(selectedId ?? 0),
    },
  });

  const isDoe = goat?.sex === "doe";
  const { data: breedings, isLoading: breedingsLoading } = useListBreedings({
    query: {
      queryKey: getListBreedingsQueryKey(),
      enabled: isDoe,
    },
  });

  const kiddingRecord = useMemo(() => {
    if (!isDoe || !goat || !breedings) return null;
    return deriveKiddingRecord(goat.id, breedings);
  }, [isDoe, goat, breedings]);

  const kiddingHistory = useMemo(() => {
    if (!isDoe || !goat || !breedings) return null;
    return deriveKiddingHistory(goat.id, breedings);
  }, [isDoe, goat, breedings]);

  const handleSelect = (value: string) => {
    setLocation(`${location.split("?")[0]}?goat=${value}`, { replace: true });
  };

  return (
    <Layout>
      <ReportHeader title="Pedigree Certificate" />

      <div className="no-print mb-8 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-bold text-foreground mb-1">Pedigree Certificate</h1>
          <p className="text-muted-foreground text-sm">
            A printable one-page pedigree for a single goat — for sales, shows, and registration paperwork.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => window.print()}
          className="self-start shrink-0"
          disabled={!goat}
        >
          <Printer className="mr-2 h-4 w-4" /> Print / Export
        </Button>
      </div>

      <div className="no-print mb-6 max-w-sm">
        <label className="mb-1.5 block text-sm font-medium text-foreground">Goat</label>
        <Select
          value={selectedId !== null ? String(selectedId) : undefined}
          onValueChange={handleSelect}
          disabled={goatsLoading}
        >
          <SelectTrigger>
            <SelectValue placeholder={goatsLoading ? "Loading goats…" : "Choose a goat…"} />
          </SelectTrigger>
          <SelectContent>
            {sortedGoats.map((g) => (
              <SelectItem key={g.id} value={String(g.id)}>
                {g.name}
                {g.registeredName ? ` — ${g.registeredName}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedId === null ? (
        <div className="no-print flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-20 text-center text-muted-foreground">
          <Award className="mb-3 h-10 w-10 text-muted-foreground/30" />
          <p>Choose a goat above to generate its pedigree certificate.</p>
        </div>
      ) : isError ? (
        <div className="no-print flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-20 text-center text-muted-foreground">
          <p>That goat could not be found. Pick another one from the list above.</p>
        </div>
      ) : goatLoading || !goat || (isDoe && breedingsLoading) ? (
        <CertificateSkeleton />
      ) : (
        <Certificate goat={goat} kiddingRecord={kiddingRecord} kiddingHistory={kiddingHistory} />
      )}
    </Layout>
  );
}
