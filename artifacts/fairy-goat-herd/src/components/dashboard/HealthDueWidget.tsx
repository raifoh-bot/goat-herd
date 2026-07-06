import { useMemo } from "react";
import { Link } from "wouter";
import { HeartPulse, Stethoscope } from "lucide-react";
import {
  type DueHealthItem,
  type Goat,
  type HealthDueResponse,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Short labels for the schedulable task types shown on due badges. */
const SCHEDULE_TYPE_LABELS: Record<string, string> = {
  hoof_trim: "Hoof trim",
  cdt_shot: "CD&T",
  copper_bolus: "Copper bolus",
  deworming: "Deworming",
};

/** True when the farm has at least one routine health schedule configured. */
export function hasHealthSchedules(data: HealthDueResponse | undefined): boolean {
  if (!data) return false;
  return Object.values(data.intervals ?? {}).some((v) => typeof v === "number");
}

/** A compact phrase describing the tasks due for a goat. */
function taskSummary(items: DueHealthItem[]): string {
  return items
    .map((i) => SCHEDULE_TYPE_LABELS[i.eventType] ?? i.eventType)
    .join(", ");
}

interface GoatDueEntry {
  goat: Goat;
  items: DueHealthItem[];
  /** 0 = overdue, 1 = never done, 2 = due soon (drives sort + badge style). */
  rank: 0 | 1 | 2;
  badgeLabel: string;
  badgeVariant: "destructive" | "secondary";
  /** Secondary sort value within a rank (more urgent first). */
  urgency: number;
}

function buildEntry(goat: Goat, items: DueHealthItem[], now: number): GoatDueEntry {
  const overdue = items.filter((i) => i.status === "overdue");
  const never = items.filter((i) => i.status === "never");
  if (overdue.length > 0) {
    const maxDays = Math.max(...overdue.map((i) => i.daysOverdue));
    return {
      goat,
      items,
      rank: 0,
      badgeLabel: `${maxDays}d overdue`,
      badgeVariant: "destructive",
      urgency: maxDays,
    };
  }
  if (never.length > 0) {
    return {
      goat,
      items,
      rank: 1,
      badgeLabel: "Not yet done",
      badgeVariant: "destructive",
      urgency: 0,
    };
  }
  // Due-soon only: badge by the soonest upcoming due date.
  const dueDates = items
    .map((i) => (i.dueDate ? new Date(i.dueDate).getTime() : null))
    .filter((t): t is number => t != null);
  const soonest = dueDates.length > 0 ? Math.min(...dueDates) : now;
  const days = Math.max(0, Math.ceil((soonest - now) / DAY_MS));
  return {
    goat,
    items,
    rank: 2,
    badgeLabel: days <= 0 ? "Due soon" : `in ${days}d`,
    badgeVariant: "secondary",
    // Sooner due dates are more urgent; negate so smaller `days` sorts first.
    urgency: -days,
  };
}

export function HealthDueWidget({
  data,
  isLoading,
}: {
  data?: HealthDueResponse;
  isLoading: boolean;
}) {
  const { entries, dueNowCount, dueSoonCount } = useMemo(() => {
    const now = Date.now();
    const goats = data?.goats ?? [];
    const built = goats
      .filter((g) => g.items.length > 0)
      .map((g) => buildEntry(g.goat, g.items, now))
      .sort((a, b) => (a.rank !== b.rank ? a.rank - b.rank : b.urgency - a.urgency));

    let dueNow = 0;
    let dueSoon = 0;
    for (const g of goats) {
      for (const item of g.items) {
        if (item.status === "due-soon") dueSoon += 1;
        else dueNow += 1;
      }
    }
    return { entries: built, dueNowCount: dueNow, dueSoonCount: dueSoon };
  }, [data]);

  const top = entries.slice(0, 5);
  const extra = entries.length - top.length;

  return (
    <Card className="h-full shadow-md border-primary/10">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="font-serif text-lg">Health Work Due</CardTitle>
        <Link
          href="/health-events/new"
          className="text-sm text-primary hover:text-primary/80 font-medium transition-colors"
        >
          Log work day →
        </Link>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-9 w-9 rounded-lg" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : entries.length > 0 ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {dueNowCount > 0 && (
                <Badge variant="destructive">
                  {dueNowCount} task{dueNowCount === 1 ? "" : "s"} due now
                </Badge>
              )}
              {dueSoonCount > 0 && (
                <Badge variant="secondary">
                  {dueSoonCount} due soon
                </Badge>
              )}
            </div>
            <div className="space-y-2">
              {top.map(({ goat, items, badgeLabel, badgeVariant }) => (
                <Link key={goat.id} href="/health-events/new">
                  <div className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer">
                    <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0 overflow-hidden border border-primary/20">
                      {goat.imageUrl ? (
                        <img src={goat.imageUrl} alt={goat.name} className="w-full h-full object-cover" />
                      ) : (
                        <HeartPulse className="h-4 w-4" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-foreground truncate">{goat.name}</h4>
                      <p className="text-xs text-muted-foreground truncate">{taskSummary(items)}</p>
                    </div>
                    <Badge variant={badgeVariant} className="shrink-0">{badgeLabel}</Badge>
                  </div>
                </Link>
              ))}
            </div>
            {extra > 0 && (
              <Link
                href="/health-events/new"
                className="block text-center text-sm text-primary hover:text-primary/80 font-medium pt-1"
              >
                +{extra} more goat{extra === 1 ? "" : "s"} due →
              </Link>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
            <Stethoscope className="h-8 w-8 mb-2 opacity-40" />
            <p className="text-sm">All caught up — no routine work due</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
