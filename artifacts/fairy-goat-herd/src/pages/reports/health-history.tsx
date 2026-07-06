import { useMemo } from "react";
import { useLocation, useSearch } from "wouter";
import { HeartPulse, Printer } from "lucide-react";
import {
  useGetGoat,
  useListGoats,
  useListGoatHealthEvents,
  getGetGoatQueryKey,
  getListGoatHealthEventsQueryKey,
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
import { healthEventTypeConfig } from "@/components/health-history";
import { breedLabels } from "@/lib/breeds";
import { formatAge } from "@/lib/age";
import { formatDate } from "@/lib/date";
import { useFarmSettings, weightUnitLabel } from "@/lib/settings";
import type {
  Goat,
  HealthEvent,
} from "@workspace/api-client-react/src/generated/api.schemas";

function sexLabel(sex: Goat["sex"]): string {
  if (sex === "doe") return "Doe";
  if (sex === "buck") return "Buck";
  if (sex === "wether") return "Wether";
  return "—";
}

const healthStatusLabels: Record<string, string> = {
  healthy: "Healthy",
  watch: "Watch",
  treatment: "In Treatment",
  dry: "Dry",
};

const lactationLabels: Record<string, string> = {
  milking: "Milking",
  dry: "Dry",
  exposed: "Exposed",
  serviced: "Serviced",
  pregnant: "Pregnant",
  kid: "Kid",
  retired: "Retired",
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
        ? lactationLabels[goat.lactationStatus] ?? goat.lactationStatus
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
                    Dosage (mL)
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
                      {event.dosageMl ?? "—"}
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

export default function HealthHistoryReport() {
  const search = useSearch();
  const [location, setLocation] = useLocation();
  const { weightUnit } = useFarmSettings();

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

  const { data: events, isLoading: eventsLoading } = useListGoatHealthEvents(selectedId ?? 0, {
    query: {
      enabled: selectedId !== null,
      queryKey: getListGoatHealthEventsQueryKey(selectedId ?? 0),
    },
  });

  const handleSelect = (value: string) => {
    setLocation(`${location.split("?")[0]}?goat=${value}`, { replace: true });
  };

  return (
    <Layout>
      <ReportHeader title="Health History Report" />

      <div className="no-print mb-8 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-bold text-foreground mb-1">Health History Report</h1>
          <p className="text-muted-foreground text-sm">
            Printable health record for a single goat — ideal for providing to a buyer of an unregistered goat.
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
          <HeartPulse className="mb-3 h-10 w-10 text-muted-foreground/30" />
          <p>Choose a goat above to generate its health history report.</p>
        </div>
      ) : isError ? (
        <div className="no-print flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-20 text-center text-muted-foreground">
          <p>That goat could not be found. Pick another one from the list above.</p>
        </div>
      ) : goatLoading || eventsLoading || !goat ? (
        <ReportSkeleton />
      ) : (
        <HealthRecord goat={goat} events={events ?? []} weightUnit={weightUnitLabel(weightUnit)} />
      )}
    </Layout>
  );
}
