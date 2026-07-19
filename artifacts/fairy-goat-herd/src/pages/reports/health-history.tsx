import { useEffect, useMemo, useRef, useState } from "react";
import { useSearch } from "wouter";
import { HeartPulse, Printer } from "lucide-react";
import {
  useListGoats,
  useListGoatHealthEvents,
  getListGoatHealthEventsQueryKey,
} from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { ReportHeader } from "@/components/report-header";
import { healthEventTypeConfig } from "@/components/health-history";
import { breedLabels, breedLabel } from "@/lib/breeds";
import { formatAge } from "@/lib/age";
import { formatDate } from "@/lib/date";
import { LACTATION_LABELS, BREEDING_LABELS, sexLabel } from "@/lib/goats";
import { doseUnit } from "@/lib/health";
import { useFarmSettings, weightUnitLabel } from "@/lib/settings";
import type {
  Goat,
  HealthEvent,
} from "@workspace/api-client-react/src/generated/api.schemas";

const healthStatusLabels: Record<string, string> = {
  healthy: "Healthy",
  watch: "Watch",
  treatment: "In Treatment",
  dry: "Dry",
};

function ReportSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-24 w-full rounded-xl" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}

/** The printable one-page health record body for a single goat. */
function HealthRecord({
  goat,
  events,
  weightUnit,
}: {
  goat: Goat;
  events: HealthEvent[];
  weightUnit: string;
}) {
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
    { label: "Status", value: healthStatusLabels[goat.status] ?? goat.status },
    {
      label: "Lactation Status",
      value: goat.lactationStatus
        ? LACTATION_LABELS[goat.lactationStatus] ?? goat.lactationStatus
        : "—",
    },
    {
      label: "Breeding Status",
      value: goat.breedingStatus
        ? BREEDING_LABELS[goat.breedingStatus] ?? goat.breedingStatus
        : "—",
    },
  ];

  // Chronological order: oldest first.
  const chronological = [...events].sort((a, b) => a.eventDate.localeCompare(b.eventDate));

  return (
    <div className="rounded-2xl border border-primary/10 shadow-md bg-card overflow-hidden print:border-0 print:shadow-none print:rounded-none">
      <div className="p-6 sm:p-8 space-y-8 print:p-0">
        {/* Animal identity */}
        <div className="text-center border-b-2 border-foreground/10 pb-6 print:border-foreground/30">
          <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-2">
            Health History Report
          </div>
          <h2 className="font-serif text-3xl font-bold text-foreground">{goat.name}</h2>
          {goat.registeredName && (
            <p className="mt-1 text-base italic text-muted-foreground">{goat.registeredName}</p>
          )}
        </div>

        {/* Details */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {details.map((d) => (
            <div key={d.label} className="text-center">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{d.label}</div>
              <div className="text-sm font-medium text-foreground">{d.value}</div>
            </div>
          ))}
        </div>

        {/* Health events */}
        <div>
          <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-3 border-b border-border pb-1">
            Health Events
          </h3>
          {chronological.length === 0 ? (
            <p className="py-6 text-center text-sm italic text-muted-foreground">
              No health events recorded
            </p>
          ) : (
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-border print:border-foreground/30">
                  <th className="py-1.5 pr-3 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                    Date
                  </th>
                  <th className="py-1.5 pr-3 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                    Event Type
                  </th>
                  <th className="py-1.5 pr-3 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                    FAMACHA
                  </th>
                  <th className="py-1.5 pr-3 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                    Dosage
                  </th>
                  <th className="py-1.5 pr-3 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                    Weight ({weightUnit})
                  </th>
                  <th className="py-1.5 pr-3 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                    Product
                  </th>
                  <th className="py-1.5 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Notes
                  </th>
                </tr>
              </thead>
              <tbody>
                {chronological.map((event) => (
                  <tr
                    key={event.id}
                    className="border-b border-border/50 last:border-b-0 print:border-foreground/20"
                  >
                    <td className="py-1.5 pr-3 text-foreground whitespace-nowrap align-top">
                      {formatDate(event.eventDate, { month: "short", day: "numeric", year: "numeric" })}
                    </td>
                    <td className="py-1.5 pr-3 text-foreground whitespace-nowrap align-top">
                      {healthEventTypeConfig[event.eventType]?.label ?? event.eventType}
                    </td>
                    <td className="py-1.5 pr-3 text-foreground align-top">
                      {event.famachaScore ?? "—"}
                    </td>
                    <td className="py-1.5 pr-3 text-foreground align-top">
                      {event.dosageMl != null ? `${event.dosageMl} ${doseUnit(event.eventType)}` : "—"}
                    </td>
                    <td className="py-1.5 pr-3 text-foreground align-top">
                      {event.bodyWeight ?? "—"}
                    </td>
                    <td className="py-1.5 pr-3 text-foreground align-top">
                      {event.productName || "—"}
                    </td>
                    <td className="py-1.5 text-muted-foreground align-top">
                      {event.notes || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

/** Fetches one goat's health events and renders its printable record. */
function GoatHealthRecordSection({
  goat,
  weightUnit,
  isLast,
}: {
  goat: Goat;
  weightUnit: string;
  isLast: boolean;
}) {
  const { data: events, isLoading } = useListGoatHealthEvents(goat.id, {
    query: { queryKey: getListGoatHealthEventsQueryKey(goat.id) },
  });

  return (
    <div className={isLast ? "" : "print:break-after-page"}>
      {isLoading ? (
        <ReportSkeleton />
      ) : (
        <HealthRecord goat={goat} events={events ?? []} weightUnit={weightUnit} />
      )}
    </div>
  );
}

export default function HealthHistoryReport() {
  const search = useSearch();
  const { weightUnit } = useFarmSettings();

  // Deep link support: `?goat=<id>` pre-selects a single goat (linked from the
  // goat detail page). Selection beyond that is managed locally.
  const deepLinkId = useMemo(() => {
    const raw = new URLSearchParams(search).get("goat");
    const parsed = raw ? parseInt(raw, 10) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }, [search]);

  const [selected, setSelected] = useState<Set<Goat["id"]>>(new Set());
  const initializedRef = useRef(false);

  const { data: goats, isLoading: goatsLoading } = useListGoats();
  const sortedGoats = useMemo(
    () => (goats ? [...goats].sort((a, b) => a.name.localeCompare(b.name)) : []),
    [goats],
  );

  // Initialize selection from the deep link once goats load.
  useEffect(() => {
    if (initializedRef.current || !goats) return;
    initializedRef.current = true;
    if (deepLinkId !== null && goats.some((g) => g.id === deepLinkId)) {
      setSelected(new Set([deepLinkId]));
    }
  }, [goats, deepLinkId]);

  const selectedGoats = sortedGoats.filter((g) => selected.has(g.id));
  const allSelected = sortedGoats.length > 0 && sortedGoats.every((g) => selected.has(g.id));
  const deepLinkMissing =
    deepLinkId !== null && goats !== undefined && !goats.some((g) => g.id === deepLinkId);

  function toggleGoat(id: Goat["id"]) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(() => {
      if (allSelected) return new Set();
      return new Set(sortedGoats.map((g) => g.id));
    });
  }

  return (
    <Layout>
      <ReportHeader title="Health History Report" />

      <div className="no-print mb-8 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-bold text-foreground mb-1">Health History Report</h1>
          <p className="text-muted-foreground text-sm">
            Printable health records — pick one goat, or several to print one record per page (handy when selling a group).
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => window.print()}
          className="self-start shrink-0"
          disabled={selectedGoats.length === 0}
        >
          <Printer className="mr-2 h-4 w-4" /> Print / Export
        </Button>
      </div>

      {/* Goat selection — hidden when printing. */}
      <div className="no-print mb-8 rounded-xl border border-border bg-card p-4 shadow-sm space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-medium text-foreground">Goats</div>
          <Button
            variant="outline"
            size="sm"
            onClick={toggleAll}
            disabled={sortedGoats.length === 0}
            className="shrink-0"
          >
            {allSelected ? "Deselect All" : "Select All"}
          </Button>
        </div>

        {goatsLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-10 rounded-lg" />
            ))}
          </div>
        ) : sortedGoats.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No goats in the herd yet.</p>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 max-h-72 overflow-y-auto pr-1">
              {sortedGoats.map((goat) => (
                <label
                  key={goat.id}
                  className="flex items-center gap-2.5 rounded-lg border border-border/60 px-3 py-2 text-sm cursor-pointer hover:bg-muted/40 transition-colors"
                >
                  <Checkbox
                    checked={selected.has(goat.id)}
                    onCheckedChange={() => toggleGoat(goat.id)}
                    aria-label={`Include ${goat.name}`}
                  />
                  <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                    {goat.name}
                    {goat.registeredName ? (
                      <span className="font-normal text-muted-foreground"> — {goat.registeredName}</span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {breedLabel(goat.breed)} · {sexLabel(goat.sex)}
                  </span>
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {selectedGoats.length} of {sortedGoats.length} goat{sortedGoats.length !== 1 ? "s" : ""} selected
              {selectedGoats.length > 1 ? " — each prints on its own page." : "."}
            </p>
          </>
        )}
      </div>

      {deepLinkMissing && selectedGoats.length === 0 ? (
        <div className="no-print flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-20 text-center text-muted-foreground">
          <p>That goat could not be found. Pick another one from the list above.</p>
        </div>
      ) : selectedGoats.length === 0 ? (
        <div className="no-print flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-20 text-center text-muted-foreground">
          <HeartPulse className="mb-3 h-10 w-10 text-muted-foreground/30" />
          <p>Select one or more goats above to generate their health history reports.</p>
        </div>
      ) : (
        <div className="space-y-6 print:space-y-0">
          {selectedGoats.map((goat, i) => (
            <GoatHealthRecordSection
              key={goat.id}
              goat={goat}
              weightUnit={weightUnitLabel(weightUnit)}
              isLast={i === selectedGoats.length - 1}
            />
          ))}
        </div>
      )}
    </Layout>
  );
}
