import { Link } from "wouter";
import { Sparkles, Activity, ShieldPlus, Moon, Flame, Droplet, Mountain, Wind, Sun, CloudRain } from "lucide-react";
import type { Goat } from "@workspace/api-client-react/src/generated/api.schemas";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

interface GoatCardProps {
  goat: Goat;
}

export function GoatCard({ goat }: GoatCardProps) {
  const elementColors = {
    fire: "bg-chart-5/20 text-chart-5 border-chart-5/30",
    water: "bg-chart-4/20 text-chart-4 border-chart-4/30",
    earth: "bg-chart-1/20 text-chart-1 border-chart-1/30",
    air: "bg-muted text-muted-foreground border-muted-foreground/30",
    light: "bg-chart-2/20 text-chart-2 border-chart-2/30",
    shadow: "bg-chart-3/20 text-chart-3 border-chart-3/30",
  };

  const statusColors = {
    healthy: "bg-chart-1 text-primary-foreground",
    sick: "bg-destructive text-destructive-foreground",
    resting: "bg-secondary text-secondary-foreground",
    enchanted: "bg-primary text-primary-foreground",
  };

  return (
    <Link href={`/goats/${goat.id}`}>
      <Card className="group overflow-hidden transition-all duration-300 hover:shadow-lg hover:-translate-y-1 border-primary/10 bg-card h-full flex flex-col cursor-pointer">
        <div className="relative aspect-square overflow-hidden bg-muted/30">
          {goat.imageUrl ? (
            <img 
              src={goat.imageUrl} 
              alt={goat.name} 
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-primary/5 to-primary/10">
              <Sparkles className="h-12 w-12 text-primary/40 mb-2" />
              <span className="text-xs font-medium text-primary/50 uppercase tracking-widest">No Portrait</span>
            </div>
          )}
          
          <div className="absolute top-3 right-3 flex gap-2">
            <Badge className={`${statusColors[goat.status]} shadow-sm border-none`}>
              {goat.status}
            </Badge>
          </div>
          
          <div className="absolute top-3 left-3 flex gap-2">
            <Badge variant="outline" className={`${elementColors[goat.element]} capitalize shadow-sm backdrop-blur-md`}>
              {goat.element}
            </Badge>
          </div>
        </div>

        <CardHeader className="pb-2 pt-4 px-4 flex-none">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="font-serif text-lg font-bold text-foreground line-clamp-1 group-hover:text-primary transition-colors">
                {goat.name}
              </h3>
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
                <span>Age {goat.age}</span>
                <span className="w-1 h-1 rounded-full bg-muted-foreground/30"></span>
                <span className="capitalize">{goat.wingType} Wings</span>
              </p>
            </div>
          </div>
        </CardHeader>

        <CardContent className="px-4 pb-4 pt-2 flex-1 flex flex-col justify-end">
          <div className="space-y-1.5 w-full">
            <div className="flex justify-between text-xs mb-1">
              <span className="font-medium text-muted-foreground flex items-center gap-1.5">
                <Moon className="h-3 w-3" /> Magic Level
              </span>
              <span className="font-bold text-primary">{goat.magicLevel} / 100</span>
            </div>
            <Progress value={goat.magicLevel} className="h-1.5 bg-primary/10" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
