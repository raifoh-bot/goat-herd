import { useMemo, useState } from "react";
import { CalendarDays, CalendarPlus, Download } from "lucide-react";
import { type BreedingWithDoe } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { MiniCalendar, toDateKey } from "@/components/dashboard/MiniCalendar";
import { useFarmSettings } from "@/lib/settings";
import { getEffectiveDueDate, doeLeftHerd } from "@/lib/breeding";
import {
  downloadIcs,
  toGoogleCalendarUrl,
  toOutlookWebUrl,
  type CalendarEvent,
} from "@/lib/calendarExport";

const STATUS_LABELS: Record<string, string> = {
  bred: "Bred",
  "confirmed-pregnant": "Confirmed pregnant",
};

function buildEvent(b: BreedingWithDoe, due: Date): CalendarEvent {
  const doeName = b.doe?.name ?? "Unknown doe";
  const sire = b.sireName ? ` (sire: ${b.sireName})` : "";
  return {
    title: `Kidding due: ${doeName}`,
    startDate: due,
    description: `${doeName} is expected to kid${sire}. Status: ${
      STATUS_LABELS[b.status] ?? b.status
    }.`,
  };
}

interface DueBreeding {
  breeding: BreedingWithDoe;
  due: Date;
}

export function BreedingCalendarWidget({
  breedings,
  isLoading,
}: {
  breedings?: BreedingWithDoe[];
  isLoading: boolean;
}) {
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const { gestationDays } = useFarmSettings();

  // Group active breedings (bred + confirmed-pregnant) by their due-date key.
  const byDate = useMemo(() => {
    const map = new Map<string, DueBreeding[]>();
    for (const b of breedings ?? []) {
      if (b.status !== "bred" && b.status !== "confirmed-pregnant") continue;
      if (doeLeftHerd(b)) continue;
      const due = getEffectiveDueDate(b, gestationDays);
      if (!due) continue;
      const key = toDateKey(due);
      const list = map.get(key) ?? [];
      list.push({ breeding: b, due });
      map.set(key, list);
    }
    return map;
  }, [breedings, gestationDays]);

  const markedDates = useMemo(() => {
    const counts = new Map<string, number>();
    for (const [key, list] of byDate) counts.set(key, list.length);
    return counts;
  }, [byDate]);

  const nextMonth = new Date(month.getFullYear(), month.getMonth() + 1, 1);
  const selectedDate = selectedKey ? new Date(`${selectedKey}T00:00:00`) : null;
  const selectedList = selectedKey ? byDate.get(selectedKey) ?? [] : [];

  const handleDateSelect = (date: Date) => {
    const key = toDateKey(date);
    setSelectedKey((prev) => (prev === key ? null : key));
  };

  return (
    <Card className="h-full shadow-md border-primary/10">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="font-serif text-lg flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-primary" /> Breeding Calendar
        </CardTitle>
        <span className="text-sm text-muted-foreground">Expected kidding dates</span>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[320px] w-full rounded-lg" />
        ) : (
          <div className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              {/* Current month: only the "previous" arrow lives here. */}
              <MiniCalendar
                month={month}
                onMonthChange={setMonth}
                markedDates={markedDates}
                selectedDate={selectedDate}
                onDateSelect={handleDateSelect}
                showNextButton={false}
              />
              {/* Next month: only the "next" arrow lives here. Advancing it
                  moves the base month forward by one. */}
              <MiniCalendar
                month={nextMonth}
                onMonthChange={(m) => setMonth(new Date(m.getFullYear(), m.getMonth() - 1, 1))}
                markedDates={markedDates}
                selectedDate={selectedDate}
                onDateSelect={handleDateSelect}
                showPrevButton={false}
              />
            </div>

            <div className="min-h-[140px] border-t border-border pt-4">
              {selectedDate ? (
                <>
                  <h4 className="text-sm font-medium text-foreground mb-3">
                    {selectedDate.toLocaleDateString(undefined, {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                    })}
                  </h4>
                  {selectedList.length > 0 ? (
                    <ul className="space-y-3">
                      {selectedList.map(({ breeding, due }) => {
                        const event = buildEvent(breeding, due);
                        const doeName = breeding.doe?.name ?? "Unknown doe";
                        return (
                          <li
                            key={breeding.id}
                            className="rounded-lg border border-border bg-card p-3"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="font-medium text-foreground truncate">{doeName}</p>
                                <p className="text-xs text-muted-foreground">
                                  {breeding.sireName ? `Sire: ${breeding.sireName}` : "Sire unknown"}
                                </p>
                              </div>
                              <Badge variant="secondary" className="shrink-0">
                                {STATUS_LABELS[breeding.status] ?? breeding.status}
                              </Badge>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <a
                                href={toGoogleCalendarUrl(event)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground hover:bg-muted transition-colors"
                              >
                                <CalendarPlus className="h-3.5 w-3.5" /> Google
                              </a>
                              <a
                                href={toOutlookWebUrl(event)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground hover:bg-muted transition-colors"
                              >
                                <CalendarPlus className="h-3.5 w-3.5" /> Outlook
                              </a>
                              <button
                                type="button"
                                onClick={() =>
                                  downloadIcs(event, `kidding-${doeName.replace(/\s+/g, "-").toLowerCase()}.ics`)
                                }
                                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground hover:bg-muted transition-colors"
                              >
                                <Download className="h-3.5 w-3.5" /> .ics
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">No kiddings due on this day.</p>
                  )}
                </>
              ) : (
                <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
                  <CalendarDays className="h-8 w-8 mb-2 opacity-40" />
                  <p className="text-sm">
                    {markedDates.size > 0
                      ? "Select a highlighted date to see the kiddings due and add them to your calendar."
                      : "No upcoming kiddings to show on the calendar yet."}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
