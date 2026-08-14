import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { Responsive, WidthProvider, type Layout as GridLayoutItem } from "react-grid-layout";
import { useQueryClient } from "@tanstack/react-query";
import { Activity, Milk, ShieldPlus, Stethoscope, SlidersHorizontal, CalendarHeart, PawPrint, GripHorizontal, Move, Check, Trophy } from "lucide-react";
import {
  getGetBreedBreakdownQueryKey,
  getGetCurrentUserQueryKey,
  getGetDashboardSummaryQueryKey,
  getGetRecentActivityQueryKey,
  getGetSettingsQueryKey,
  getGetHealthWorkDueQueryKey,
  getListBreedingsQueryKey,
  useGetBreedBreakdown,
  useGetDashboardSummary,
  useGetHealthWorkDue,
  useGetRecentActivity,
  useGetSettings,
  useListBreedings,
  useUpdateDashboardLayout,
  useUpdateSettings,
  type BreedingWithDoe,
  type BreedCount,
  type DashboardWidget,
} from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { breedLabels } from "@/lib/breeds";
import { useAuth, useIsManager } from "@/lib/auth";
import {
  resolveDashboardLayout,
  getWidgetGridItem,
  getWidgetGridItemMd,
  type DashboardWidgetId,
} from "@/lib/dashboard-widgets";
import { CustomizeDashboard } from "@/components/customize-dashboard";
import { useToast } from "@/hooks/use-toast";
import "react-grid-layout/css/styles.css";
import { BreedingCalendarWidget } from "@/components/dashboard/BreedingCalendarWidget";
import { HealthDueWidget, hasHealthSchedules } from "@/components/dashboard/HealthDueWidget";
import { OnboardingBanner } from "@/components/onboarding-banner";
import { useFarmSettings } from "@/lib/settings";
import { getEffectiveDueDate, doeLeftHerd } from "@/lib/breeding";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  PieChart, Pie, Tooltip as RechartsTooltip,
  ResponsiveContainer, Cell,
} from "recharts";

const LACTATION_COLORS: Record<string, string> = {
  Milking: "hsl(var(--chart-1))",
  Dry: "hsl(var(--chart-2))",
  Exposed: "hsl(217 91% 60%)",
  Serviced: "hsl(262 83% 58%)",
  Pregnant: "hsl(var(--chart-3))",
  Kid: "hsl(var(--chart-4))",
  Retired: "hsl(var(--chart-5))",
};

const ResponsiveGridLayout = WidthProvider(Responsive);

/**
 * Breakpoints for the dashboard grid. Three responsive states:
 *  - `xs` (<768px, phones): a single stacked column.
 *  - `md` (768–995px, tablets / narrow laptops): a balanced 6-column grid so
 *    the dashboard doesn't feel long and empty.
 *  - `lg` (≥996px, desktop): the full 12-column snap grid, the only layout that
 *    supports drag/resize persistence.
 */
const GRID_BREAKPOINTS = { lg: 996, md: 768, xs: 0 };
const GRID_COLS = { lg: 12, md: 6, xs: 1 };
type GridBreakpoint = keyof typeof GRID_COLS;
const GRID_ROW_HEIGHT = 40;
const GRID_MARGIN: [number, number] = [16, 16];

const BREED_BAR_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

export default function Dashboard() {
  const isManager = useIsManager();
  const { user } = useAuth();
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [currentBreakpoint, setCurrentBreakpoint] = useState<GridBreakpoint>("lg");
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const updatePersonal = useUpdateDashboardLayout();
  const updateFarm = useUpdateSettings();

  const { data: summary, isLoading: isLoadingSummary } = useGetDashboardSummary({ query: { queryKey: getGetDashboardSummaryQueryKey() } });
  const { data: recentActivity, isLoading: isLoadingActivity } = useGetRecentActivity({ query: { queryKey: getGetRecentActivityQueryKey() } });
  const { data: settings } = useGetSettings({ query: { queryKey: getGetSettingsQueryKey(), staleTime: 30_000 } });

  // A user's personal layout wins when set; otherwise fall back to the
  // farm-wide default. resolveDashboardLayout keeps either stable against the
  // current widget catalog and fills in default grid coordinates.
  const personalLayout = user.dashboardLayout;
  const resolvedLayout = useMemo(
    () => resolveDashboardLayout(personalLayout ?? settings?.dashboardLayout),
    [personalLayout, settings?.dashboardLayout],
  );

  // Local working copy so drag/resize feels instant; it re-syncs whenever the
  // saved layout changes (a save round-trips, or the Customize panel toggles a
  // widget's visibility).
  const [widgets, setWidgets] = useState<DashboardWidget[]>(resolvedLayout);
  const resolvedKey = JSON.stringify(resolvedLayout);
  useEffect(() => {
    setWidgets(resolvedLayout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedKey]);

  const visibleWidgets = widgets.filter((w) => w.visible);
  const showUpcomingKiddings = visibleWidgets.some((w) => w.id === "upcoming-kiddings");
  const showBreedingCalendar = visibleWidgets.some((w) => w.id === "breeding-calendar");
  const showBreedBreakdown = visibleWidgets.some((w) => w.id === "breed-breakdown");
  const showHealthDue = visibleWidgets.some((w) => w.id === "health-due");

  const { data: breedings, isLoading: isLoadingBreedings } = useListBreedings({
    query: {
      queryKey: getListBreedingsQueryKey(),
      enabled: showUpcomingKiddings || showBreedingCalendar,
    },
  });
  const { data: breedBreakdown, isLoading: isLoadingBreedBreakdown } = useGetBreedBreakdown({
    query: { queryKey: getGetBreedBreakdownQueryKey(), enabled: showBreedBreakdown },
  });
  const { data: healthDue, isLoading: isLoadingHealthDue } = useGetHealthWorkDue({
    query: { queryKey: getGetHealthWorkDueQueryKey(), enabled: showHealthDue },
  });

  // The Health Work Due widget only makes sense once a farm has configured at
  // least one routine schedule; otherwise it is hidden entirely (no empty slot).
  const healthDueConfigured = hasHealthSchedules(healthDue);

  const lactationChartData = summary?.doeLactationBreakdown
    ? [
        { name: "Milking", value: summary.doeLactationBreakdown.milking },
        { name: "Dry", value: summary.doeLactationBreakdown.dry },
        { name: "Exposed", value: summary.doeLactationBreakdown.exposed },
        { name: "Serviced", value: summary.doeLactationBreakdown.serviced },
        { name: "Pregnant", value: summary.doeLactationBreakdown.pregnant },
        { name: "Kid", value: summary.doeLactationBreakdown.kid },
        { name: "Retired", value: summary.doeLactationBreakdown.retired },
      ].filter((d) => d.value > 0)
    : [];

  // The Health Work Due widget only renders once a farm has configured at least
  // one routine schedule; otherwise it is dropped entirely (no empty slot).
  const renderedWidgets = visibleWidgets.filter(
    (w) => w.id !== "health-due" || isLoadingHealthDue || healthDueConfigured,
  );

  const gridLayouts = useMemo(() => {
    const lg: GridLayoutItem[] = renderedWidgets.map((w) => {
      const gi = getWidgetGridItem(w.id);
      return {
        i: w.id,
        x: w.x ?? gi?.x ?? 0,
        y: w.y ?? gi?.y ?? 0,
        w: w.w ?? gi?.w ?? 3,
        h: w.h ?? gi?.h ?? 3,
        minW: gi?.minW ?? 2,
        minH: gi?.minH ?? 2,
      };
    });
    // On the intermediate 6-column tablet grid, widgets use their md default
    // placements (never persisted; drag/resize only applies to `lg`).
    const md: GridLayoutItem[] = renderedWidgets.map((w) => {
      const gi = getWidgetGridItemMd(w.id);
      return {
        i: w.id,
        x: gi?.x ?? 0,
        y: gi?.y ?? 0,
        w: gi?.w ?? 3,
        h: gi?.h ?? 3,
        minW: gi?.minW ?? 2,
        minH: gi?.minH ?? 2,
      };
    });
    // On the single-column mobile stack, widgets keep their saved order but span
    // the full width; positions here are never persisted.
    const xs: GridLayoutItem[] = renderedWidgets.map((w, idx) => {
      const gi = getWidgetGridItem(w.id);
      return {
        i: w.id,
        x: 0,
        y: idx,
        w: 1,
        h: w.h ?? gi?.h ?? 3,
        minW: 1,
        minH: gi?.minH ?? 2,
      };
    });
    return { lg, md, xs };
  }, [renderedWidgets]);

  const persistLayout = (next: DashboardWidget[]) => {
    const onError = () =>
      toast({
        title: "Could not save layout",
        description: "Your dashboard arrangement could not be saved.",
        variant: "destructive",
      });
    // With no personal override, a manager edits the shared farm default on
    // canvas; everyone else's moves create/update their own personal layout.
    if (personalLayout == null && isManager) {
      updateFarm.mutate(
        { data: { dashboardLayout: next } },
        {
          onSuccess: () =>
            queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() }),
          onError,
        },
      );
    } else {
      updatePersonal.mutate(
        { data: { dashboardLayout: next } },
        {
          onSuccess: () =>
            queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() }),
          onError,
        },
      );
    }
  };

  const handleGridChange = (newLayout: GridLayoutItem[]) => {
    // Only desktop (12-column) moves are persisted; the single-column mobile
    // stack is a read-only projection of the saved order.
    if (currentBreakpoint !== "lg") return;
    const byId = new Map(newLayout.map((item) => [item.i, item]));
    const next = widgets.map((w) => {
      const item = byId.get(w.id);
      return item ? { ...w, x: item.x, y: item.y, w: item.w, h: item.h } : w;
    });
    setWidgets(next);
    persistLayout(next);
  };

  const renderWidget = (id: string) => {
    switch (id as DashboardWidgetId) {
      case "total-goats":
        return <TotalGoatsCard summary={summary} isLoading={isLoadingSummary} />;
      case "health-status":
        return (
          <StatCard
            title="Healthy"
            value={summary?.healthyCount}
            icon={ShieldPlus}
            isLoading={isLoadingSummary}
            description="No current concerns"
            href="/goats?healthStatus=healthy"
          />
        );
      case "milking-status":
        return (
          <StatCard
            title="Milking"
            value={summary?.milkingCount}
            icon={Milk}
            isLoading={isLoadingSummary}
            description="Currently in milk"
            href="/goats?lactationStatus=milking"
          />
        );
      case "avg-milk":
        return (
          <StatCard
            title="Average Milk/Day"
            value={summary ? `${summary.averageMilkPerDay} L` : undefined}
            icon={Milk}
            isLoading={isLoadingSummary}
            description="Across the whole herd"
            href="/goats"
          />
        );
      case "does-breakdown":
        return (
          <DoesBreakdownCard
            doeCount={summary?.doeCount}
            isLoading={isLoadingSummary}
            chartData={lactationChartData}
          />
        );
      case "upcoming-kiddings":
        return <UpcomingKiddingsCard breedings={breedings} isLoading={isLoadingBreedings} />;
      case "breeding-calendar":
        return <BreedingCalendarWidget breedings={breedings} isLoading={isLoadingBreedings} />;
      case "health-due":
        return <HealthDueWidget data={healthDue} isLoading={isLoadingHealthDue} />;
      case "breed-breakdown":
        return <BreedBreakdownCard breakdown={breedBreakdown} isLoading={isLoadingBreedBreakdown} />;
      case "recent-activity":
        return (
          <RecentActivityCard recentActivity={recentActivity} isLoading={isLoadingActivity} />
        );
      case "show-time":
        return <ShowTimeCard />;
      default:
        return null;
    }
  };

  return (
    <Layout>
      <div className="space-y-8 animate-in fade-in duration-500">
        <OnboardingBanner />
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl sm:text-3xl font-serif font-bold text-foreground mb-2">Herd Overview</h2>
            <p className="text-muted-foreground">Track production, health, and composition across your goat herd.</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {visibleWidgets.length > 0 && (
              <Button
                variant={editMode ? "default" : "outline"}
                size="sm"
                onClick={() => setEditMode((v) => !v)}
              >
                {editMode ? (
                  <>
                    <Check className="mr-2 h-4 w-4" /> Done editing
                  </>
                ) : (
                  <>
                    <Move className="mr-2 h-4 w-4" /> Edit layout
                  </>
                )}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setCustomizeOpen(true)}>
              <SlidersHorizontal className="mr-2 h-4 w-4" /> Customize
            </Button>
          </div>
        </div>

        {editMode && currentBreakpoint === "lg" && (
          <p className="text-sm text-muted-foreground">
            Drag the handle at the top of a widget to move it, or drag its
            bottom-right corner to resize. Changes save automatically.
          </p>
        )}

        {visibleWidgets.length === 0 ? (
          <Card className="border-dashed border-primary/20">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
              <SlidersHorizontal className="h-8 w-8 mb-3 opacity-40" />
              <p className="font-medium text-foreground">All widgets are hidden</p>
              <p className="text-sm">Use Customize to show dashboard widgets again.</p>
            </CardContent>
          </Card>
        ) : (
          <ResponsiveGridLayout
            layouts={gridLayouts}
            breakpoints={GRID_BREAKPOINTS}
            cols={GRID_COLS}
            rowHeight={GRID_ROW_HEIGHT}
            margin={GRID_MARGIN}
            containerPadding={[0, 0]}
            isDraggable={editMode && currentBreakpoint === "lg"}
            isResizable={editMode && currentBreakpoint === "lg"}
            draggableHandle=".widget-drag-handle"
            onBreakpointChange={(bp) =>
              setCurrentBreakpoint(bp === "lg" ? "lg" : bp === "md" ? "md" : "xs")
            }
            onDragStop={handleGridChange}
            onResizeStop={handleGridChange}
            compactType="vertical"
            useCSSTransforms
          >
            {renderedWidgets.map((w) => (
              <div key={w.id} className="relative h-full">
                {editMode && currentBreakpoint === "lg" && (
                  <div className="widget-drag-handle absolute inset-x-0 top-0 z-10 flex h-6 cursor-move items-center justify-center rounded-t-xl bg-primary/10 text-primary/60 transition-colors hover:bg-primary/20">
                    <GripHorizontal className="h-4 w-4" />
                  </div>
                )}
                <div
                  className={`h-full overflow-hidden ${
                    editMode && currentBreakpoint === "lg"
                      ? "rounded-xl pt-6 ring-2 ring-primary/30"
                      : ""
                  }`}
                >
                  <div className="h-full overflow-auto">{renderWidget(w.id)}</div>
                </div>
              </div>
            ))}
          </ResponsiveGridLayout>
        )}
      </div>

      <CustomizeDashboard
        open={customizeOpen}
        onOpenChange={setCustomizeOpen}
        farmLayout={settings?.dashboardLayout}
        personalLayout={personalLayout}
        isManager={isManager}
      />
    </Layout>
  );
}

function DoesBreakdownCard({
  doeCount,
  isLoading,
  chartData,
}: {
  doeCount?: number;
  isLoading: boolean;
  chartData: { name: string; value: number }[];
}) {
  const [, navigate] = useLocation();
  const doeLactationUrl = (name: string) => `/goats?sex=doe&lactationStatus=${name.toLowerCase()}`;
  return (
    <Card className="h-full shadow-md border-primary/10">
      <CardHeader>
        <div className="flex items-baseline justify-between gap-2">
          <div className="flex items-baseline gap-2">
            <CardTitle className="font-serif text-lg">Does</CardTitle>
            {isLoading
              ? <Skeleton className="h-7 w-10" />
              : (
                <Link href="/goats?sex=doe" className="text-3xl font-serif font-bold text-primary hover:text-primary/80 transition-colors cursor-pointer">
                  {doeCount ?? 0}
                </Link>
              )
            }
          </div>
          <Link href="/goats?sex=doe" className="text-sm text-primary hover:text-primary/80 font-medium transition-colors">
            View does →
          </Link>
        </div>
        <p className="text-sm text-muted-foreground">Lactation status breakdown</p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center items-center h-[220px]">
            <Skeleton className="h-[180px] w-full rounded-lg" />
          </div>
        ) : chartData.length > 0 ? (
          <div className="space-y-3">
            <div className="h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={58}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                    isAnimationActive={false}
                    onClick={(entry: { name?: string }) => {
                      if (entry?.name) navigate(doeLactationUrl(entry.name));
                    }}
                  >
                    {chartData.map((entry) => (
                      <Cell key={entry.name} fill={LACTATION_COLORS[entry.name] ?? "hsl(var(--chart-1))"} className="cursor-pointer focus:outline-none" />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "var(--shadow-md)", fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5">
              {chartData.map((entry) => (
                <Link
                  key={entry.name}
                  href={doeLactationUrl(entry.name)}
                  className="flex items-center gap-1.5 rounded-md px-1.5 py-0.5 hover:bg-muted/60 transition-colors cursor-pointer"
                >
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ background: LACTATION_COLORS[entry.name] ?? "hsl(var(--chart-1))" }} />
                  <span className="text-xs text-muted-foreground">{entry.name} <span className="font-medium text-foreground">{entry.value}</span></span>
                </Link>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-[220px] text-muted-foreground">
            <Milk className="h-8 w-8 mb-2 opacity-40" />
            <p className="text-sm">No does recorded yet</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function UpcomingKiddingsCard({
  breedings,
  isLoading,
}: {
  breedings?: BreedingWithDoe[];
  isLoading: boolean;
}) {
  const now = Date.now();
  const { gestationDays } = useFarmSettings();
  // Use the shared resolver so this card and the Breeding Calendar widget always
  // agree on the due day, including the breeding-date + gestation fallback when
  // no expected kidding date was recorded.
  const upcoming = (breedings ?? [])
    .filter((b) => b.status === "bred" || b.status === "confirmed-pregnant")
    .filter((b) => !doeLeftHerd(b))
    .map((b) => ({ ...b, due: getEffectiveDueDate(b, gestationDays) }))
    .filter((b): b is BreedingWithDoe & { due: Date } => b.due != null)
    .sort((a, b) => a.due.getTime() - b.due.getTime())
    .slice(0, 5);

  const formatDue = (due: Date) => {
    const days = Math.round((due.getTime() - now) / (24 * 60 * 60 * 1000));
    const dateLabel = due.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    if (days < 0) return { dateLabel, rel: `${Math.abs(days)}d overdue`, overdue: true };
    if (days === 0) return { dateLabel, rel: "Due today", overdue: false };
    return { dateLabel, rel: `in ${days}d`, overdue: false };
  };

  return (
    <Card className="h-full shadow-md border-primary/10">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="font-serif text-lg">Upcoming Kiddings</CardTitle>
        <Link href="/breedings" className="text-sm text-primary hover:text-primary/80 font-medium transition-colors">
          View all →
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
                  <Skeleton className="h-3 w-1/4" />
                </div>
              </div>
            ))}
          </div>
        ) : upcoming.length > 0 ? (
          <div className="space-y-2">
            {upcoming.map((b) => {
              const { dateLabel, rel, overdue } = formatDue(b.due);
              return (
                <Link key={b.id} href={`/breedings/${b.id}`}>
                  <div className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer">
                    <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                      <CalendarHeart className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-foreground truncate">{b.doe?.name ?? "Unknown doe"}</h4>
                      <p className="text-xs text-muted-foreground">{dateLabel}</p>
                    </div>
                    <Badge variant={overdue ? "destructive" : "secondary"} className="shrink-0">{rel}</Badge>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
            <CalendarHeart className="h-8 w-8 mb-2 opacity-40" />
            <p className="text-sm">No upcoming kiddings</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BreedBreakdownCard({
  breakdown,
  isLoading,
}: {
  breakdown?: BreedCount[];
  isLoading: boolean;
}) {
  const sorted = [...(breakdown ?? [])].sort((a, b) => b.count - a.count);
  const max = sorted.reduce((m, b) => Math.max(m, b.count), 0);

  return (
    <Card className="h-full shadow-md border-primary/10">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="font-serif text-lg">Breed Breakdown</CardTitle>
        <Link href="/goats" className="text-sm text-primary hover:text-primary/80 font-medium transition-colors">
          View all →
        </Link>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="space-y-1.5">
                <Skeleton className="h-3 w-1/4" />
                <Skeleton className="h-3 w-full rounded-full" />
              </div>
            ))}
          </div>
        ) : sorted.length > 0 ? (
          <div className="space-y-1">
            {sorted.map((b, i) => (
              <Link
                key={b.breed}
                href={`/goats?breed=${encodeURIComponent(b.breed)}`}
                className="block space-y-1 rounded-lg -mx-2 px-2 py-1.5 hover:bg-muted/50 transition-colors cursor-pointer group"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">{breedLabels[b.breed] ?? b.breed}</span>
                  <span className="text-sm text-muted-foreground">{b.count}</span>
                </div>
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: max > 0 ? `${(b.count / max) * 100}%` : "0%",
                      background: BREED_BAR_COLORS[i % BREED_BAR_COLORS.length],
                    }}
                  />
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
            <PawPrint className="h-8 w-8 mb-2 opacity-40" />
            <p className="text-sm">No goats recorded yet</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RecentActivityCard({
  recentActivity,
  isLoading,
}: {
  recentActivity?: { id: number; name: string; breed: string; status: string; lactationStatus?: string | null; imageUrl?: string | null }[];
  isLoading: boolean;
}) {
  return (
    <Card className="h-full shadow-md border-primary/10">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="font-serif text-lg">Recent Herd Updates</CardTitle>
        <Link href="/goats" className="text-sm text-primary hover:text-primary/80 font-medium transition-colors">
          View all →
        </Link>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-12 w-12 rounded-lg" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-1/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : recentActivity && recentActivity.length > 0 ? (
          <div className="space-y-4">
            {recentActivity.map((goat, i) => (
              <Link key={goat.id} href={`/goats/${goat.id}`}>
                <div className="flex items-center gap-4 p-3 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer animate-in fade-in slide-in-from-bottom-2" style={{ animationDelay: `${i * 100}ms` }}>
                  <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary overflow-hidden border border-primary/20">
                    {goat.imageUrl ? <img src={goat.imageUrl} alt={goat.name} className="w-full h-full object-cover" /> : <Milk className="h-5 w-5" />}
                  </div>
                  <div className="flex-1">
                    <h4 className="font-medium text-foreground">{goat.name}</h4>
                    <p className="text-sm text-muted-foreground flex items-center gap-2">
                      {breedLabels[goat.breed]} · {goat.lactationStatus ?? "—"}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Badge variant="outline" className="capitalize">{breedLabels[goat.breed]}</Badge>
                    <Badge variant={goat.status === "treatment" ? "destructive" : goat.status === "watch" ? "secondary" : "default"} className="capitalize">
                      {goat.status}
                    </Badge>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <Stethoscope className="h-8 w-8 text-muted-foreground/50" />
            </div>
            <p>Your herd list is empty.</p>
            <Link href="/goats/new" className="mt-4 text-primary font-medium hover:underline">
              Add your first goat
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TotalGoatsCard({ summary, isLoading }: { summary?: { totalGoats: number; doeCount: number; buckCount: number; wetherCount: number } | null; isLoading: boolean }) {
  return (
    <Card className="h-full shadow-sm border-primary/10 transition-all duration-300 hover:shadow-md hover:border-primary/30 group">
      <Link href="/goats" className="block cursor-pointer">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground group-hover:text-primary transition-colors">Total Goats</CardTitle>
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
            <Activity className="h-4 w-4 text-primary" />
          </div>
        </CardHeader>
      </Link>
      <CardContent>
        {isLoading
          ? <Skeleton className="h-8 w-16 mb-3" />
          : (
            <Link href="/goats" className="inline-block cursor-pointer">
              <div className="text-2xl font-serif font-bold text-foreground mb-3 hover:text-primary transition-colors">{summary?.totalGoats ?? 0}</div>
            </Link>
          )
        }
        {isLoading ? (
          <div className="flex gap-2">
            <Skeleton className="h-5 w-14 rounded-full" />
            <Skeleton className="h-5 w-14 rounded-full" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            <Link href="/goats?sex=doe" className="inline-flex items-center gap-1 rounded-full bg-secondary/60 px-2 py-0.5 text-sm sm:text-xs font-medium text-secondary-foreground hover:bg-secondary transition-colors cursor-pointer">
              <span className="text-xs sm:text-[10px]">♀</span> {summary?.doeCount ?? 0} Does
            </Link>
            <Link href="/goats?sex=buck" className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-sm sm:text-xs font-medium text-muted-foreground hover:bg-muted/70 hover:text-foreground transition-colors cursor-pointer">
              <span className="text-xs sm:text-[10px]">♂</span> {summary?.buckCount ?? 0} Bucks
            </Link>
            {(summary?.wetherCount ?? 0) > 0 && (
              <Link href="/goats?sex=wether" className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-sm sm:text-xs font-medium text-muted-foreground hover:bg-muted/70 hover:text-foreground transition-colors cursor-pointer">
                ⚬ {summary?.wetherCount ?? 0} Wethers
              </Link>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ShowTimeCard() {
  return (
    <Card className="border-primary/10 shadow-md h-full flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base font-serif flex items-center gap-2">
          <Trophy className="h-4 w-4 text-primary" /> Show Time
        </CardTitle>
        <Link href="/reports/show-time" className="text-sm text-primary hover:text-primary/80 font-medium transition-colors">
          Open →
        </Link>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Print-ready check-in sheet for shows: barn name, registered name, breed, age, and each
          doe's kidding record.
        </p>
        <Link href="/reports/show-time" className="self-start">
          <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90">
            <Trophy className="mr-2 h-4 w-4" /> Prepare Show Sheet
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

function StatCard({ title, value, icon: Icon, isLoading, description, href }: { title: string; value?: number | string; icon: any; isLoading: boolean; description?: string; href?: string }) {
  const card = (
    <Card className="h-full shadow-sm border-primary/10 transition-all duration-300 hover:shadow-md hover:border-primary/30 group">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground group-hover:text-primary transition-colors">{title}</CardTitle>
        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
          <Icon className="h-4 w-4 text-primary" />
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? <Skeleton className="h-8 w-16 mb-1" /> : <div className="text-2xl font-serif font-bold text-foreground">{value ?? 0}</div>}
        {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
      </CardContent>
    </Card>
  );

  if (!href) return card;
  return (
    <Link href={href} className="block h-full cursor-pointer">
      {card}
    </Link>
  );
}
