import { useState } from "react";
import { Link } from "wouter";
import { Plus, Heart, Calendar, Baby, CheckCircle2, XCircle, Clock, Zap, LogIn, LogOut, Loader2 } from "lucide-react";
import {
  getListBreedingsQueryKey,
  useListBreedings,
  useCreateBreedingEvent,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { formatDate } from "@/lib/date";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import type { BreedingWithDoe } from "@workspace/api-client-react/src/generated/api.schemas";

const statusConfig = {
  bred: { label: "Bred", icon: Heart, className: "bg-secondary text-secondary-foreground" },
  "confirmed-pregnant": { label: "Pregnant", icon: CheckCircle2, className: "bg-chart-1 text-primary-foreground" },
  kidded: { label: "Kidded", icon: Baby, className: "bg-primary text-primary-foreground" },
  open: { label: "Open", icon: XCircle, className: "bg-destructive text-destructive-foreground" },
};

interface ExposureDialogState {
  breedingId: number;
  doeName: string;
  eventType: "exposed" | "removed";
  date: string;
}

function BreedingCard({
  breeding,
  onExposureAction,
}: {
  breeding: BreedingWithDoe;
  onExposureAction: (state: ExposureDialogState) => void;
}) {
  const config = statusConfig[breeding.status];
  const StatusIcon = config.icon;
  const breedingDate = new Date(breeding.breedingDate);
  const expectedDate = breeding.expectedKiddingDate
    ? new Date(breeding.expectedKiddingDate)
    : new Date(breedingDate.getTime() + 145 * 24 * 60 * 60 * 1000);
  const daysUntilKidding = Math.ceil((expectedDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

  const showExposureButton = breeding.status === "bred" || breeding.status === "confirmed-pregnant";
  const isExposed = breeding.hasActiveExposure;
  const doeName = breeding.doe?.name ?? `Doe #${breeding.doeId}`;

  const handleExposureClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onExposureAction({
      breedingId: breeding.id,
      doeName,
      eventType: isExposed ? "removed" : "exposed",
      date: new Date().toISOString().slice(0, 10),
    });
  };

  return (
    <Link href={`/breedings/${breeding.id}`}>
      <Card className="group overflow-hidden transition-all duration-300 hover:shadow-lg hover:-translate-y-1 border-primary/10 bg-card cursor-pointer h-full">
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <h3 className="font-serif text-lg font-bold text-foreground group-hover:text-primary transition-colors line-clamp-1">
                {doeName}
              </h3>
              <p className="text-sm text-muted-foreground">× {breeding.sireName}</p>
            </div>
            <div className="flex flex-col items-end gap-1.5 shrink-0">
              <Badge className={`${config.className} flex items-center gap-1.5 px-2.5 py-1`}>
                <StatusIcon className="h-3 w-3" />
                {config.label}
              </Badge>
              {isExposed && (
                <Badge className="bg-amber-500/15 text-amber-700 border border-amber-400/40 flex items-center gap-1.5 px-2.5 py-1 dark:text-amber-400 dark:bg-amber-500/10">
                  <Zap className="h-3 w-3" />
                  Exposed{breeding.exposedDays != null && breeding.exposedDays > 0 ? ` · ${breeding.exposedDays}d` : ""}
                </Badge>
              )}
            </div>
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="h-3.5 w-3.5 shrink-0" />
              {breeding.kids && breeding.kids.length > 0 && breeding.kids[0].birthDate ? (
                <span>Date of kidding {formatDate(breeding.kids[0].birthDate, { month: "short", day: "numeric", year: "numeric" })}</span>
              ) : (
                <span>Bred {formatDate(breeding.breedingDate, { month: "short", day: "numeric", year: "numeric" })}</span>
              )}
            </div>

            {breeding.status !== "kidded" && breeding.status !== "open" && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="h-3.5 w-3.5 shrink-0" />
                <span>
                  Est. {formatDate(expectedDate, { month: "short", day: "numeric", year: "numeric" })}
                  {" · "}
                  {daysUntilKidding > 0 ? `${daysUntilKidding}d away` : "Overdue"}
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

          {breeding.kids && breeding.kids.length > 0 && (
            <div className="mt-3 border-t border-border pt-3 space-y-1.5">
              <p className="text-xs font-medium text-foreground">
                {breeding.kids.length} kid{breeding.kids.length !== 1 ? "s" : ""}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {breeding.kids.map((kid, i) => (
                  <span
                    key={kid.id ?? i}
                    className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${
                      kid.kidStatus === "doa"
                        ? "bg-destructive/10 border-destructive/20 text-destructive"
                        : kid.sex === "doe"
                        ? "bg-secondary/60 border-secondary text-secondary-foreground"
                        : "bg-muted border-border text-muted-foreground"
                    }`}
                  >
                    {kid.name || (kid.sex === "doe" ? "Doe" : "Buck")}
                    <span className="opacity-60">{kid.sex === "doe" ? "♀" : "♂"}</span>
                    {kid.kidStatus === "doa" && <span className="opacity-70">· DOA</span>}
                  </span>
                ))}
              </div>
            </div>
          )}

          {breeding.notes && !breeding.kids?.length && (
            <p className="mt-3 text-xs text-muted-foreground line-clamp-2 italic border-t border-border pt-3">{breeding.notes}</p>
          )}

          {showExposureButton && (
            <div className="mt-3 border-t border-border pt-3">
              <Button
                variant="outline"
                size="sm"
                className={`w-full text-xs h-8 ${
                  isExposed
                    ? "border-muted-foreground/30 text-muted-foreground hover:text-destructive hover:border-destructive/40"
                    : "border-amber-400/40 text-amber-700 hover:bg-amber-50 hover:border-amber-500/60 dark:text-amber-400 dark:hover:bg-amber-500/10"
                }`}
                onClick={handleExposureClick}
              >
                {isExposed ? (
                  <>
                    <LogOut className="h-3.5 w-3.5 mr-1.5" />
                    Log Removal
                  </>
                ) : (
                  <>
                    <LogIn className="h-3.5 w-3.5 mr-1.5" />
                    Log Exposure
                  </>
                )}
              </Button>
            </div>
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
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const createEvent = useCreateBreedingEvent();

  const [dialogState, setDialogState] = useState<ExposureDialogState | null>(null);
  const [dialogDate, setDialogDate] = useState("");

  const active = breedings?.filter((b) => b.status === "bred" || b.status === "confirmed-pregnant") ?? [];
  const past = breedings?.filter((b) => b.status === "kidded" || b.status === "open") ?? [];

  const openDialog = (state: ExposureDialogState) => {
    setDialogState(state);
    setDialogDate(state.date);
  };

  const closeDialog = () => {
    setDialogState(null);
    setDialogDate("");
  };

  const handleConfirm = () => {
    if (!dialogState || !dialogDate) return;
    createEvent.mutate(
      {
        id: dialogState.breedingId,
        data: {
          eventType: dialogState.eventType,
          eventDate: new Date(dialogDate + "T12:00:00").toISOString(),
        },
      },
      {
        onSuccess: async () => {
          await queryClient.refetchQueries({ queryKey: getListBreedingsQueryKey() });
          const label = dialogState.eventType === "exposed" ? "Exposure logged" : "Removal logged";
          toast({ title: label });
          closeDialog();
        },
        onError: () => {
          toast({ title: "Failed to save event", variant: "destructive" });
        },
      }
    );
  };

  return (
    <Layout>
      <div className="space-y-8 animate-in fade-in duration-500">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-3xl font-serif font-bold text-foreground mb-2">Kidding Records</h2>
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
            <h3 className="text-xl font-serif font-medium text-foreground mb-2">No kidding records yet</h3>
            <p className="text-muted-foreground max-w-md mb-6">Record a breeding when you breed a doe to start tracking pregnancies and kidding outcomes.</p>
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
                  {active.map((b) => <BreedingCard key={b.id} breeding={b} onExposureAction={openDialog} />)}
                </div>
              </section>
            )}

            {past.length > 0 && (
              <section>
                <h3 className="text-lg font-serif font-semibold text-foreground mb-4 flex items-center gap-2">
                  <Baby className="h-4 w-4 text-muted-foreground" />
                  Past Kiddings ({past.length})
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {past.map((b) => <BreedingCard key={b.id} breeding={b} onExposureAction={openDialog} />)}
                </div>
              </section>
            )}
          </div>
        )}
      </div>

      <Dialog open={dialogState !== null} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle className="font-serif flex items-center gap-2">
              {dialogState?.eventType === "exposed" ? (
                <><LogIn className="h-4 w-4 text-amber-600" /> Log Exposure</>
              ) : (
                <><LogOut className="h-4 w-4 text-muted-foreground" /> Log Removal</>
              )}
            </DialogTitle>
            <DialogDescription>
              {dialogState?.eventType === "exposed"
                ? `Record when ${dialogState?.doeName} was put in with the buck.`
                : `Record when ${dialogState?.doeName} was removed from the buck.`}
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Label htmlFor="event-date" className="text-sm mb-1.5 block">Date</Label>
            <Input
              id="event-date"
              type="date"
              value={dialogDate}
              onChange={(e) => setDialogDate(e.target.value)}
              className="bg-background/50"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={closeDialog} disabled={createEvent.isPending}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleConfirm}
              disabled={!dialogDate || createEvent.isPending}
              className={dialogState?.eventType === "exposed" ? "bg-amber-600 hover:bg-amber-700 text-white" : ""}
            >
              {createEvent.isPending ? (
                <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Saving…</>
              ) : (
                dialogState?.eventType === "exposed" ? "Log Exposure" : "Log Removal"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
