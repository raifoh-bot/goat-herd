import { Link } from "wouter";
import { Activity, HeartPulse, Milk, ShieldPlus, Sprout, Stethoscope } from "lucide-react";
import {
  getGetBreedBreakdownQueryKey,
  getGetDashboardSummaryQueryKey,
  getGetRecentActivityQueryKey,
  useGetBreedBreakdown,
  useGetDashboardSummary,
  useGetRecentActivity,
} from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend } from "recharts";
import { Badge } from "@/components/ui/badge";

const breedLabels: Record<string, string> = {
  alpine: "Alpine",
  nubian: "Nubian",
  saanen: "Saanen",
  lamancha: "LaMancha",
  toggenburg: "Toggenburg",
  boer: "Boer",
  "nigerian-dwarf": "Nigerian Dwarf",
  oberhasli: "Oberhasli",
  mixed: "Mixed",
};

export default function Dashboard() {
  const { data: summary, isLoading: isLoadingSummary } = useGetDashboardSummary({ query: { queryKey: getGetDashboardSummaryQueryKey() } });
  const { data: breedBreakdown, isLoading: isLoadingBreakdown } = useGetBreedBreakdown({ query: { queryKey: getGetBreedBreakdownQueryKey() } });
  const { data: recentActivity, isLoading: isLoadingActivity } = useGetRecentActivity({ query: { queryKey: getGetRecentActivityQueryKey() } });

  const chartColors = [
    "hsl(var(--chart-1))",
    "hsl(var(--chart-2))",
    "hsl(var(--chart-3))",
    "hsl(var(--chart-4))",
    "hsl(var(--chart-5))",
  ];

  const chartData = breedBreakdown?.map((item, index) => ({
    name: breedLabels[item.breed] || item.breed,
    value: item.count,
    color: chartColors[index % chartColors.length],
  })) || [];

  return (
    <Layout>
      <div className="space-y-8 animate-in fade-in duration-500">
        <div>
          <h2 className="text-3xl font-serif font-bold text-foreground mb-2">Herd Overview</h2>
          <p className="text-muted-foreground">Track production, health, and breed mix across your dairy goat herd.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Total Goats"
            value={summary?.totalGoats}
            icon={Activity}
            isLoading={isLoadingSummary}
            description="Active herd members"
          />
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
          <StatCard
            title="Avg Milk / Day"
            value={summary?.averageMilkPerDay ? `${summary.averageMilkPerDay} qt` : undefined}
            icon={HeartPulse}
            isLoading={isLoadingSummary}
            description="Across the herd"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <Card className="lg:col-span-1 shadow-md border-primary/10">
            <CardHeader>
              <CardTitle className="font-serif text-lg">Breed Mix</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoadingBreakdown ? (
                <div className="flex justify-center items-center h-[300px]">
                  <Skeleton className="h-[200px] w-[200px] rounded-full" />
                </div>
              ) : chartData.length > 0 ? (
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={chartData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                        {chartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <RechartsTooltip contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "var(--shadow-md)" }} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground">
                  <Sprout className="h-8 w-8 mb-2 opacity-50" />
                  <p>No breed data yet</p>
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
                            {breedLabels[goat.breed]} • {goat.milkPerDay} qt/day • {goat.lactationStatus}
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
        {isLoading ? <Skeleton className="h-8 w-16 mb-1" /> : <div className="text-2xl font-serif font-bold text-foreground">{value || 0}</div>}
        {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
      </CardContent>
    </Card>
  );
}
