import { Link } from "wouter";
import { CheckCircle2, Milk } from "lucide-react";
import type { Goat } from "@workspace/api-client-react/src/generated/api.schemas";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { breedLabels } from "@/lib/breeds";
import { formatAge } from "@/lib/age";
import { sexLabelWithSymbol } from "@/lib/goats";

function hasCompleteBreedingLines(goat: Goat): boolean {
  return !!(
    goat.damName &&
    goat.sireName &&
    goat.maternalGranddamName &&
    goat.maternalGrandsireName &&
    goat.paternalGranddamName &&
    goat.paternalGrandsireName
  );
}

const TATTOO_LOCATIONS: { field: keyof Goat; label: string }[] = [
  { field: "rightEarTattoo", label: "R Ear" },
  { field: "leftEarTattoo", label: "L Ear" },
  { field: "rightTailTattoo", label: "R Tail" },
  { field: "leftTailTattoo", label: "L Tail" },
  { field: "centerTailTattoo", label: "C Tail" },
];

interface GoatCardProps {
  goat: Goat;
}

export function GoatCard({ goat }: GoatCardProps) {
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

          <div className="absolute top-3 left-3 flex flex-col gap-1.5 items-start">
            <Badge variant="outline" className="bg-card/85 capitalize shadow-sm backdrop-blur-md">
              {breedLabels[goat.breed]}
            </Badge>
            {hasCompleteBreedingLines(goat) && (
              <Badge variant="outline" className="bg-card/85 shadow-sm backdrop-blur-md flex items-center gap-1 text-primary border-primary/30">
                <CheckCircle2 className="h-3 w-3" />
                Includes Breeding Lines
              </Badge>
            )}
          </div>
        </div>

        <CardHeader className="pb-4 pt-4 px-4 flex-none">
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
                <span className="capitalize">{sexLabelWithSymbol(goat)}</span>
              </>
            )}
          </p>
          {goat.adgaId && (
            <p className="text-xs text-muted-foreground/70 mt-1 font-mono">ADGA #{goat.adgaId}</p>
          )}
          {(() => {
            const tattoos = TATTOO_LOCATIONS.filter((loc) => goat[loc.field]);
            if (tattoos.length === 0 && !goat.eidNumber) return null;
            return (
              <div className="mt-2 flex flex-wrap gap-1">
                {tattoos.map((loc) => (
                  <span
                    key={loc.field}
                    className="inline-flex items-center gap-1 rounded bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                  >
                    <span className="uppercase tracking-wide">{loc.label}:</span>
                    <span className="font-mono font-semibold uppercase text-foreground/80">{String(goat[loc.field])}</span>
                  </span>
                ))}
                {goat.eidNumber && (
                  <span className="inline-flex items-center gap-1 rounded bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    <span className="uppercase tracking-wide">EID:</span>
                    <span className="font-mono font-semibold text-foreground/80">{goat.eidNumber}</span>
                  </span>
                )}
              </div>
            );
          })()}
        </CardHeader>
      </Card>
    </Link>
  );
}
