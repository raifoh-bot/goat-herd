import { Trophy } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  getGetGoatAccoladesQueryKey,
  useGetGoatAccolades,
} from "@workspace/api-client-react";
import { formatDate } from "@/lib/date";

function shortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return formatDate(new Date(iso), { month: "short", day: "numeric", year: "numeric" });
}

/**
 * "Accolades" card on the goat detail page: the goat's show results grouped
 * by show (name, location, date), newest show first. Hidden entirely when the
 * goat has no recorded show results.
 */
export function AccoladesCard({ goatId }: { goatId: number }) {
  const { data: accolades } = useGetGoatAccolades(goatId, {
    query: { enabled: !!goatId, queryKey: getGetGoatAccoladesQueryKey(goatId) },
  });

  if (!accolades || accolades.length === 0) return null;

  return (
    <Card className="border-primary/10 shadow-md">
      <CardHeader>
        <CardTitle className="font-serif text-lg flex items-center gap-2">
          <Trophy className="h-5 w-5 text-primary" /> Accolades
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {accolades.map(({ show, results }) => (
          <div key={show.id} className="rounded-xl border border-border bg-card/50 p-4">
            <div className="mb-2">
              <div className="font-medium text-foreground">{show.name}</div>
              <div className="text-xs text-muted-foreground">
                {show.location ? `${show.location} · ` : ""}{shortDate(show.showDate)}
              </div>
            </div>
            <div className="space-y-1.5">
              {results.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  {r.placement && <Badge variant="secondary">{r.placement}</Badge>}
                  {r.classDivision && <span className="text-foreground">{r.classDivision}</span>}
                  {r.judgeName && <span className="text-muted-foreground">Judge: {r.judgeName}</span>}
                  {r.awardRibbon && <span className="text-muted-foreground">Award: {r.awardRibbon}</span>}
                  {r.notes && <span className="text-muted-foreground italic">{r.notes}</span>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
