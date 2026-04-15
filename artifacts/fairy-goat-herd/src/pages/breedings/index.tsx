import { Link } from "wouter";
import { Plus, Heart, Calendar, Baby, CheckCircle2, XCircle, Clock } from "lucide-react";
import { getListBreedingsQueryKey, useListBreedings } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { BreedingWithDoe } from "@workspace/api-client-react/src/generated/api.schemas";

const statusConfig = {
  bred: { label: "Bred", icon: Heart, className: "bg-secondary text-secondary-foreground" },
  "confirmed-pregnant": { label: "Pregnant", icon: CheckCircle2, className: "bg-chart-1 text-primary-foreground" },
  kidded: { label: "Kidded", icon: Baby, className: "bg-primary text-primary-foreground" },
  open: { label: "Open", icon: XCircle, className: "bg-destructive text-destructive-foreground" },
};

function BreedingCard({ breeding }: { breeding: BreedingWithDoe }) {
  const config = statusConfig[breeding.status];
  const StatusIcon = config.icon;
  const breedingDate = new Date(breeding.breedingDate);
  const expectedDate = breeding.expectedKiddingDate ? new Date(breeding.expectedKiddingDate) : null;
  const daysUntilKidding = expectedDate ? Math.ceil((expectedDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;

  return (
    <Link href={`/breedings/${breeding.id}`}>
      <Card className="group overflow-hidden transition-all duration-300 hover:shadow-lg hover:-translate-y-1 border-primary/10 bg-card cursor-pointer h-full">
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <h3 className="font-serif text-lg font-bold text-foreground group-hover:text-primary transition-colors line-clamp-1">
                {breeding.doe?.name ?? `Doe #${breeding.doeId}`}
              </h3>
              <p className="text-sm text-muted-foreground">× {breeding.sireName}</p>
            </div>
            <Badge className={`${config.className} shrink-0 flex items-center gap-1.5 px-2.5 py-1`}>
              <StatusIcon className="h-3 w-3" />
              {config.label}
            </Badge>
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="h-3.5 w-3.5 shrink-0" />
              <span>Bred {breedingDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
            </div>

            {expectedDate && breeding.status !== "kidded" && breeding.status !== "open" && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="h-3.5 w-3.5 shrink-0" />
                <span>
                  {daysUntilKidding !== null && daysUntilKidding > 0
                    ? `Kidding in ${daysUntilKidding} days`
                    : daysUntilKidding !== null && daysUntilKidding <= 0
                    ? "Kidding overdue"
                    : `Expected ${expectedDate.toLocaleDateString()}`}
                </span>
              </div>
            )}

            {breeding.doe?.breed && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Heart className="h-3.5 w-3.5 shrink-0" />
                <span className="capitalize">{breeding.doe.breed}</span>
              </div>
            )}
          </div>

          {breeding.notes && (
            <p className="mt-3 text-xs text-muted-foreground line-clamp-2 italic border-t border-border pt-3">{breeding.notes}</p>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

export default function BreedingsList() {
  const { data: breedings, isLoading } = useListBreedings({
    query: { queryKey: getListBreedingsQueryKey() },
  });

  const active = breedings?.filter((b) => b.status === "bred" || b.status === "confirmed-pregnant") ?? [];
  const past = breedings?.filter((b) => b.status === "kidded" || b.status === "open") ?? [];

  return (
    <Layout>
      <div className="space-y-8 animate-in fade-in duration-500">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-3xl font-serif font-bold text-foreground mb-2">Breeding Records</h2>
            <p className="text-muted-foreground">Track breedings, confirm pregnancies, and record kidding outcomes.</p>
          </div>
          <Link href="/breedings/new">
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-md">
              <Plus className="mr-2 h-4 w-4" />
              Record Breeding
            </Button>
          </Link>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="border-primary/10">
                <CardContent className="p-5 space-y-3">
                  <Skeleton className="h-6 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-4 w-2/3" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : !breedings?.length ? (
          <div className="flex flex-col items-center justify-center py-24 text-center bg-card/50 rounded-xl border border-dashed border-primary/20">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Heart className="h-8 w-8 text-primary/60" />
            </div>
            <h3 className="text-xl font-serif font-medium text-foreground mb-2">No breeding records yet</h3>
            <p className="text-muted-foreground max-w-md mb-6">Record a breeding when you breed a doe to a buck to start tracking pregnancies and kidding outcomes.</p>
            <Link href="/breedings/new">
              <Button>Record First Breeding</Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-10">
            {active.length > 0 && (
              <section>
                <h3 className="text-lg font-serif font-semibold text-foreground mb-4 flex items-center gap-2">
                  <Heart className="h-4 w-4 text-primary" />
                  Active ({active.length})
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {active.map((b) => <BreedingCard key={b.id} breeding={b} />)}
                </div>
              </section>
            )}

            {past.length > 0 && (
              <section>
                <h3 className="text-lg font-serif font-semibold text-foreground mb-4 flex items-center gap-2">
                  <Baby className="h-4 w-4 text-muted-foreground" />
                  Past Breedings ({past.length})
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {past.map((b) => <BreedingCard key={b.id} breeding={b} />)}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
