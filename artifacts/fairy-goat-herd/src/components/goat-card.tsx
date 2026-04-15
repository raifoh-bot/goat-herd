import { Link } from "wouter";
import { Milk, Stethoscope } from "lucide-react";
import type { Goat } from "@workspace/api-client-react/src/generated/api.schemas";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { breedLabels } from "@/pages/goats/index";
import { formatAge } from "@/lib/age";

interface GoatCardProps {
  goat: Goat;
}

export function GoatCard({ goat }: GoatCardProps) {
  const statusColors = {
    healthy: "bg-chart-1 text-primary-foreground",
    watch: "bg-secondary text-secondary-foreground",
    treatment: "bg-destructive text-destructive-foreground",
    dry: "bg-muted text-muted-foreground",
  };

  const milkProgress = Math.min(100, (goat.milkPerDay / 10) * 100);

  return (
    <Link href={`/goats/${goat.id}`}>
      <Card className="group overflow-hidden transition-all duration-300 hover:shadow-lg hover:-translate-y-1 border-primary/10 bg-card h-full flex flex-col cursor-pointer">
        <div className="relative aspect-square overflow-hidden bg-muted/30">
          {goat.imageUrl ? (
            <img src={goat.imageUrl} alt={goat.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-primary/5 to-primary/10">
              <Milk className="h-12 w-12 text-primary/40 mb-2" />
              <span className="text-xs font-medium text-primary/50 uppercase tracking-widest">No Photo</span>
            </div>
          )}

          <div className="absolute top-3 right-3 flex gap-2">
            <Badge className={`${statusColors[goat.status]} shadow-sm border-none capitalize`}>{goat.status}</Badge>
          </div>

          <div className="absolute top-3 left-3 flex gap-2">
            <Badge variant="outline" className="bg-card/85 capitalize shadow-sm backdrop-blur-md">
              {breedLabels[goat.breed]}
            </Badge>
          </div>
        </div>

        <CardHeader className="pb-2 pt-4 px-4 flex-none">
          <h3 className="font-serif text-lg font-bold text-foreground line-clamp-1 group-hover:text-primary transition-colors">{goat.name}</h3>
          {goat.registeredName && (
            <p className="text-xs text-muted-foreground/80 mt-0.5 line-clamp-1 italic">{goat.registeredName}</p>
          )}
          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5 flex-wrap">
            <span>{formatAge(goat.dateOfBirth)} old</span>
            <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
            <span className="capitalize">{goat.lactationStatus}</span>
            {goat.sex && (
              <>
                <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
                <span className="capitalize">{goat.sex === "doe" ? "Doe ♀" : "Buck ♂"}</span>
              </>
            )}
          </p>
          {goat.adgaId && (
            <p className="text-xs text-muted-foreground/70 mt-1 font-mono">ADGA #{goat.adgaId}</p>
          )}
        </CardHeader>

        <CardContent className="px-4 pb-4 pt-2 flex-1 flex flex-col justify-end">
          <div className="space-y-1.5 w-full">
            <div className="flex justify-between text-xs mb-1">
              <span className="font-medium text-muted-foreground flex items-center gap-1.5">
                <Stethoscope className="h-3 w-3" /> Milk Production
              </span>
              <span className="font-bold text-primary">{goat.milkPerDay} qt/day</span>
            </div>
            <Progress value={milkProgress} className="h-1.5 bg-primary/10" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
