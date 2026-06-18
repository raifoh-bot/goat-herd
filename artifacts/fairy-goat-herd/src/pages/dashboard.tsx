import { Link } from "wouter";
import { Activity, Milk, ShieldPlus, Stethoscope } from "lucide-react";
import {
  getGetDashboardSummaryQueryKey,
  getGetRecentActivityQueryKey,
  useGetDashboardSummary,
  useGetRecentActivity,
} from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { breedLabels } from "@/lib/breeds";
import { OnboardingBanner } from "@/components/onboarding-banner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  PieChart, Pie, Tooltip as RechartsTooltip,
  ResponsiveContainer, Cell, Legend,
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

export default function Dashboard() {
  const { data: summary, isLoading: isLoadingSummary } = useGetDashboardSummary({ query: { queryKey: getGetDashboardSummaryQueryKey() } });
  const { data: recentActivity, isLoading: isLoadingActivity } = useGetRecentActivity({ query: { queryKey: getGetRecentActivityQueryKey() } });

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

  return (
    <Layout>
      <div className="space-y-8 animate-in fade-in duration-500">
        <OnboardingBanner />
        <div>
          <h2 className="text-3xl font-serif font-bold text-foreground mb-2">Herd Overview</h2>
          <p className="text-muted-foreground">Track production, health, and composition across your goat herd.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <TotalGoatsCard summary={summary} isLoading={isLoadingSummary} />

          <StatCard
            title="Healthy"
            value={summary?.healthyCount}
            icon={ShieldPlus}
            isLoading={isLoadingSummary}
            description="No current concerns"
          />
          <StatCard
            title="Milking"
            value={summary?.milkingCount}
            icon={Milk}
            isLoading={isLoadingSummary}
            description="Currently in milk"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <Card className="lg:col-span-1 shadow-md border-primary/10">
            <CardHeader>
              <div className="flex items-baseline justify-between gap-2">
                <CardTitle className="font-serif text-lg">Does</CardTitle>
                {isLoadingSummary
                  ? <Skeleton className="h-7 w-10" />
                  : <span className="text-3xl font-serif font-bold text-primary">{summary?.doeCount ?? 0}</span>
                }
              </div>
              <p className="text-sm text-muted-foreground">Lactation status breakdown</p>
            </CardHeader>
            <CardContent>
              {isLoadingSummary ? (
                <div className="flex justify-center items-center h-[220px]">
                  <Skeleton className="h-[180px] w-full rounded-lg" />
                </div>
              ) : lactationChartData.length > 0 ? (
                <div className="space-y-3">
                  <div className="h-[200px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={lactationChartData}
                          cx="50%"
                          cy="50%"
                          innerRadius={58}
                          outerRadius={80}
                          paddingAngle={3}
                          dataKey="value"
                          isAnimationActive={false}
                        >
                          {lactationChartData.map((entry) => (
                            <Cell key={entry.name} fill={LACTATION_COLORS[entry.name] ?? "hsl(var(--chart-1))"} />
                          ))}
                        </Pie>
                        <RechartsTooltip
                          contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "var(--shadow-md)", fontSize: 12 }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5">
                    {lactationChartData.map((entry) => (
                      <div key={entry.name} className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full shrink-0" style={{ background: LACTATION_COLORS[entry.name] ?? "hsl(var(--chart-1))" }} />
                        <span className="text-xs text-muted-foreground">{entry.name} <span className="font-medium text-foreground">{entry.value}</span></span>
                      </div>
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

          <Card className="lg:col-span-2 shadow-md border-primary/10">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="font-serif text-lg">Recent Herd Updates</CardTitle>
              <Link href="/goats" className="text-sm text-primary hover:text-primary/80 font-medium transition-colors">
                View all →
              </Link>
            </CardHeader>
            <CardContent>
              {isLoadingActivity ? (
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
        </div>
      </div>
    </Layout>
  );
}

function TotalGoatsCard({ summary, isLoading }: { summary?: { totalGoats: number; doeCount: number; buckCount: number; wetherCount: number } | null; isLoading: boolean }) {
  return (
    <Card className="shadow-sm border-primary/10 transition-all duration-300 hover:shadow-md hover:border-primary/30 group">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground group-hover:text-primary transition-colors">Total Goats</CardTitle>
        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
          <Activity className="h-4 w-4 text-primary" />
        </div>
      </CardHeader>
      <CardContent>
        {isLoading
          ? <Skeleton className="h-8 w-16 mb-3" />
          : <div className="text-2xl font-serif font-bold text-foreground mb-3">{summary?.totalGoats ?? 0}</div>
        }
        {isLoading ? (
          <div className="flex gap-2">
            <Skeleton className="h-5 w-14 rounded-full" />
            <Skeleton className="h-5 w-14 rounded-full" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-full bg-secondary/60 px-2 py-0.5 text-xs font-medium text-secondary-foreground">
              <span className="text-[10px]">♀</span> {summary?.doeCount ?? 0} Does
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              <span className="text-[10px]">♂</span> {summary?.buckCount ?? 0} Bucks
            </span>
            {(summary?.wetherCount ?? 0) > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                ⚬ {summary?.wetherCount ?? 0} Wethers
              </span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatCard({ title, value, icon: Icon, isLoading, description }: { title: string; value?: number | string; icon: any; isLoading: boolean; description?: string }) {
  return (
    <Card className="shadow-sm border-primary/10 transition-all duration-300 hover:shadow-md hover:border-primary/30 group">
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
}
