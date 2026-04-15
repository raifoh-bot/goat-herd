import { Link } from "wouter";
import { Sparkles, Activity, ShieldPlus, Moon, Flame, Droplet, Mountain, Wind, Sun, CloudRain } from "lucide-react";
import { useGetDashboardSummary, useGetElementBreakdown, useGetRecentActivity, getGetDashboardSummaryQueryKey, getGetElementBreakdownQueryKey, getGetRecentActivityQueryKey } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend } from "recharts";
import { Badge } from "@/components/ui/badge";

export default function Dashboard() {
  const { data: summary, isLoading: isLoadingSummary } = useGetDashboardSummary({ query: { queryKey: getGetDashboardSummaryQueryKey() } });
  const { data: elementBreakdown, isLoading: isLoadingBreakdown } = useGetElementBreakdown({ query: { queryKey: getGetElementBreakdownQueryKey() } });
  const { data: recentActivity, isLoading: isLoadingActivity } = useGetRecentActivity({ query: { queryKey: getGetRecentActivityQueryKey() } });

  const elementColors = {
    fire: "hsl(var(--chart-5))",
    water: "hsl(var(--chart-4))",
    earth: "hsl(var(--chart-1))",
    air: "hsl(var(--muted-foreground))",
    light: "hsl(var(--chart-2))",
    shadow: "hsl(var(--chart-3))",
  };

  const chartData = elementBreakdown?.map(item => ({
    name: item.element,
    value: item.count,
    color: elementColors[item.element as keyof typeof elementColors] || "hsl(var(--primary))"
  })) || [];

  return (
    <Layout>
      <div className="space-y-8 animate-in fade-in duration-500">
        <div>
          <h2 className="text-3xl font-serif font-bold text-foreground mb-2">Sanctuary Overview</h2>
          <p className="text-muted-foreground">The current state of your enchanted herd.</p>
        </div>

        {/* Stats Row */}
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
            description="In perfect condition"
            trend="+2 from last moon"
            trendUp={true}
          />
          <StatCard
            title="Enchanted"
            value={summary?.enchantedCount}
            icon={Sparkles}
            isLoading={isLoadingSummary}
            description="Under active spells"
          />
          <StatCard
            title="Avg Magic Level"
            value={summary?.averageMagicLevel ? Math.round(summary.averageMagicLevel) : undefined}
            icon={Moon}
            isLoading={isLoadingSummary}
            description="Across the entire herd"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Chart */}
          <Card className="lg:col-span-1 shadow-md border-primary/10">
            <CardHeader>
              <CardTitle className="font-serif text-lg">Elemental Balance</CardTitle>
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
                      <Pie
                        data={chartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {chartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <RechartsTooltip 
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: 'var(--shadow-md)' }}
                      />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground">
                  <CloudRain className="h-8 w-8 mb-2 opacity-50" />
                  <p>No elemental data yet</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card className="lg:col-span-2 shadow-md border-primary/10">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="font-serif text-lg">Recent Herd Activity</CardTitle>
              <Link href="/goats" className="text-sm text-primary hover:text-primary/80 font-medium transition-colors">
                View all →
              </Link>
            </CardHeader>
            <CardContent>
              {isLoadingActivity ? (
                <div className="space-y-4">
                  {[1, 2, 3].map(i => (
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
                          {goat.imageUrl ? (
                            <img src={goat.imageUrl} alt={goat.name} className="w-full h-full object-cover" />
                          ) : (
                            <Sparkles className="h-5 w-5" />
                          )}
                        </div>
                        <div className="flex-1">
                          <h4 className="font-medium text-foreground">{goat.name}</h4>
                          <p className="text-sm text-muted-foreground flex items-center gap-2">
                            Level {goat.magicLevel} Mage • {goat.wingType !== 'none' ? `${goat.wingType} wings` : 'wingless'}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Badge variant="outline" className="capitalize">
                            {goat.element}
                          </Badge>
                          <Badge 
                            variant={goat.status === 'healthy' ? 'default' : goat.status === 'sick' ? 'destructive' : 'secondary'} 
                            className="capitalize"
                          >
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
                    <Sparkles className="h-8 w-8 text-muted-foreground/50" />
                  </div>
                  <p>Your sanctuary is empty.</p>
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

function StatCard({ 
  title, 
  value, 
  icon: Icon, 
  isLoading, 
  description,
  trend,
  trendUp
}: { 
  title: string; 
  value?: number | string; 
  icon: any; 
  isLoading: boolean;
  description?: string;
  trend?: string;
  trendUp?: boolean;
}) {
  return (
    <Card className="shadow-sm border-primary/10 transition-all duration-300 hover:shadow-md hover:border-primary/30 group">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground group-hover:text-primary transition-colors">{title}</CardTitle>
        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
          <Icon className="h-4 w-4 text-primary" />
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-8 w-16 mb-1" />
        ) : (
          <div className="text-2xl font-serif font-bold text-foreground">{value || 0}</div>
        )}
        <div className="flex items-center gap-2 mt-1">
          {trend && (
            <span className={`text-xs font-medium ${trendUp ? 'text-chart-1' : 'text-destructive'}`}>
              {trend}
            </span>
          )}
          {description && (
            <p className="text-xs text-muted-foreground">{description}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
