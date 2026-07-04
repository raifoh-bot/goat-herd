import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { Plus, Heart, Calendar, Baby, CheckCircle2, XCircle, Clock, Zap, LogIn, LogOut, Loader2, Flame, Download, Upload, MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
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
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useFarmSettings } from "@/lib/settings";
import { useSessionState } from "@/hooks/use-session-state";
import { SortSelect, type SortOption } from "@/components/sort-select";
import { downloadCsv, buildCsvFileName } from "@/lib/csvDownload";
import type { BreedingWithDoe } from "@workspace/api-client-react/src/generated/api.schemas";

type BreedingSort =
  | "date-desc"
  | "date-asc"
  | "expected-asc"
  | "expected-desc"
  | "doe-asc"
  | "doe-desc"
  | "status";

const BREEDING_SORT_OPTIONS: SortOption<BreedingSort>[] = [
  { value: "date-desc", label: "Breeding Date (Newest)" },
  { value: "date-asc", label: "Breeding Date (Oldest)" },
  { value: "expected-asc", label: "Expected Kidding (Soonest)" },
  { value: "expected-desc", label: "Expected Kidding (Latest)" },
  { value: "doe-asc", label: "Doe Name (A–Z)" },
  { value: "doe-desc", label: "Doe Name (Z–A)" },
  { value: "status", label: "Status" },
];

function breedingDoeName(b: BreedingWithDoe): string {
  return b.doe?.name ?? `Doe #${b.doeId}`;
}

function expectedKiddingMs(b: BreedingWithDoe): number {
  if (b.expectedKiddingDate) return new Date(b.expectedKiddingDate).getTime();
  return new Date(b.breedingDate).getTime() + 145 * 24 * 60 * 60 * 1000;
}

function sortBreedings(list: BreedingWithDoe[], sort: BreedingSort): BreedingWithDoe[] {
  return [...list].sort((a, b) => {
    switch (sort) {
      case "date-desc":
        return new Date(b.breedingDate).getTime() - new Date(a.breedingDate).getTime();
      case "date-asc":
        return new Date(a.breedingDate).getTime() - new Date(b.breedingDate).getTime();
      case "expected-asc":
        return expectedKiddingMs(a) - expectedKiddingMs(b);
      case "expected-desc":
        return expectedKiddingMs(b) - expectedKiddingMs(a);
      case "doe-asc":
        return breedingDoeName(a).localeCompare(breedingDoeName(b));
      case "doe-desc":
        return breedingDoeName(b).localeCompare(breedingDoeName(a));
      case "status":
        return a.status.localeCompare(b.status);
      default:
        return 0;
    }
  });
}

const statusConfig = {
  bred: { label: "Bred", icon: Heart, className: "bg-secondary text-secondary-foreground" },
  "confirmed-pregnant": { label: "Pregnant", icon: CheckCircle2, className: "bg-chart-1 text-primary-foreground" },
  kidded: { label: "Kidded", icon: Baby, className: "bg-primary text-primary-foreground" },
  open: { label: "Open", icon: XCircle, className: "bg-destructive text-destructive-foreground" },
};

interface ExposureDialogState {
  breedingId: number;
  doeName: string;
  eventType: "exposed" | "removed" | "cover";
  date: string;
}

function BreedingCard({
  breeding,
  onExposureAction,
  showAi,
}: {
  breeding: BreedingWithDoe;
  onExposureAction: (state: ExposureDialogState) => void;
  showAi: boolean;
}) {
  const config = statusConfig[breeding.status];
  const StatusIcon = config.icon;
  const breedingDate = new Date(breeding.breedingDate);
  const expectedDate = breeding.expectedKiddingDate
    ? new Date(breeding.expectedKiddingDate)
    : new Date(breedingDate.getTime() + 145 * 24 * 60 * 60 * 1000);
  const daysUntilKidding = Math.ceil((expectedDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

  const isAiRecord = breeding.breedingMethod === "ai";
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

  const handleCoverClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onExposureAction({
      breedingId: breeding.id,
      doeName,
      eventType: "cover",
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
              {showAi && isAiRecord && (
                <Badge className="bg-violet-500/15 text-violet-700 border border-violet-400/40 flex items-center gap-1.5 px-2.5 py-1 dark:text-violet-300 dark:bg-violet-500/10">
                  <Zap className="h-3 w-3" />
                  AI
                </Badge>
              )}
              {!isAiRecord && isExposed && (
                <Badge className="bg-amber-500/15 text-amber-700 border border-amber-400/40 flex items-center gap-1.5 px-2.5 py-1 dark:text-amber-400 dark:bg-amber-500/10">
                  <Zap className="h-3 w-3" />
                  Exposed{breeding.exposedDays != null && breeding.exposedDays > 0 ? ` · ${breeding.exposedDays}d` : ""}{breeding.firstExposedDate ? ` · Since ${formatDate(breeding.firstExposedDate, { month: "short", day: "numeric", year: "numeric" })}` : ""}
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

            {breeding.hasExposureEvents && (
              <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                <Zap className="h-3.5 w-3.5 shrink-0" />
                <span>
                  {`Exposed${breeding.exposedDays != null && breeding.exposedDays > 0 ? ` ${breeding.exposedDays} days` : ""}`}
                  {isExposed && breeding.firstExposedDate
                    ? ` · Since ${formatDate(breeding.firstExposedDate, { month: "short", day: "numeric", year: "numeric" })}`
                    : ""}
                  {!isExposed && breeding.lastRemovedDate
                    ? ` · ${breeding.firstExposedDate ? `${formatDate(breeding.firstExposedDate, { month: "short", day: "numeric", year: "numeric" })} – ` : ""}${formatDate(breeding.lastRemovedDate, { month: "short", day: "numeric", year: "numeric" })}`
                    : ""}
                </span>
              </div>
            )}

            {breeding.coverCount != null && breeding.coverCount > 0 && (
              <div className="flex items-center gap-2 text-rose-700 dark:text-rose-400">
                <Heart className="h-3.5 w-3.5 shrink-0" />
                <span>{breeding.coverCount} cover{breeding.coverCount !== 1 ? "s" : ""} witnessed</span>
              </div>
            )}

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
            <p className="mt-3 text-sm sm:text-xs text-muted-foreground line-clamp-2 italic border-t border-border pt-3">{breeding.notes}</p>
          )}

          {showExposureButton && isAiRecord && (
            <div className="mt-3 border-t border-border pt-3">
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs h-8 border-rose-400/40 text-rose-700 hover:bg-rose-50 hover:border-rose-500/60 dark:text-rose-400 dark:hover:bg-rose-500/10"
                onClick={handleCoverClick}
              >
                <Flame className="h-3.5 w-3.5 mr-1.5" />
                Log Cover
              </Button>
            </div>
          )}

          {showExposureButton && !isAiRecord && (
            <div className="mt-3 border-t border-border pt-3">
              {isExposed ? (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 text-xs h-8 border-rose-400/40 text-rose-700 hover:bg-rose-50 hover:border-rose-500/60 dark:text-rose-400 dark:hover:bg-rose-500/10"
                    onClick={handleCoverClick}
                  >
                    <Flame className="h-3.5 w-3.5 mr-1.5" />
                    Log Cover
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 text-xs h-8 border-muted-foreground/30 text-muted-foreground hover:text-destructive hover:border-destructive/40"
                    onClick={handleExposureClick}
                  >
                    <LogOut className="h-3.5 w-3.5 mr-1.5" />
                    Log Removal
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs h-8 border-amber-400/40 text-amber-700 hover:bg-amber-50 hover:border-amber-500/60 dark:text-amber-400 dark:hover:bg-amber-500/10"
                  onClick={handleExposureClick}
                >
                  <LogIn className="h-3.5 w-3.5 mr-1.5" />
                  Log Exposure
                </Button>
              )}
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
  const { usesAi } = useFarmSettings();

  const [dialogState, setDialogState] = useState<ExposureDialogState | null>(null);
  const [dialogDate, setDialogDate] = useState("");
  const [dialogNotes, setDialogNotes] = useState("");
  const [exporting, setExporting] = useState<"breedings" | "kids" | null>(null);
  const [, navigate] = useLocation();
  const [sort, setSort] = useSessionState<BreedingSort>("breedings-sort", "date-desc");

  const handleExport = async (kind: "breedings" | "kids") => {
    setExporting(kind);
    try {
      const path = kind === "breedings" ? "/api/breedings/export" : "/api/breedings/kids/export";
      await downloadCsv(path, buildCsvFileName(kind));
    } catch {
      toast({ title: "Export failed", description: "Could not export your records. Please try again.", variant: "destructive" });
    } finally {
      setExporting(null);
    }
  };

  const active = useMemo(
    () => sortBreedings(breedings?.filter((b) => b.status === "bred" || b.status === "confirmed-pregnant") ?? [], sort),
    [breedings, sort],
  );
  const past = useMemo(
    () => sortBreedings(breedings?.filter((b) => b.status === "kidded" || b.status === "open") ?? [], sort),
    [breedings, sort],
  );

  const openDialog = (state: ExposureDialogState) => {
    setDialogState(state);
    setDialogDate(state.date);
    setDialogNotes("");
  };

  const closeDialog = () => {
    setDialogState(null);
    setDialogDate("");
    setDialogNotes("");
  };

  const handleConfirm = () => {
    if (!dialogState || !dialogDate) return;
    createEvent.mutate(
      {
        id: dialogState.breedingId,
        data: {
          eventType: dialogState.eventType,
          eventDate: new Date(dialogDate + "T12:00:00").toISOString(),
          notes: dialogNotes.trim() ? dialogNotes.trim() : undefined,
        },
      },
      {
        onSuccess: async () => {
          await queryClient.refetchQueries({ queryKey: getListBreedingsQueryKey() });
          const label =
            dialogState.eventType === "exposed"
              ? "Exposure logged"
              : dialogState.eventType === "cover"
              ? "Cover logged"
              : "Removal logged";
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
            <h2 className="text-2xl sm:text-3xl font-serif font-bold text-foreground mb-2">Kidding Records</h2>
            <p className="text-muted-foreground">Track breedings, confirm pregnancies, and record kidding outcomes.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="shadow-sm">
                  {exporting !== null ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MoreHorizontal className="mr-2 h-4 w-4" />}
                  More
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onSelect={() => navigate("/breedings/import")}>
                  <Upload className="mr-2 h-4 w-4" />
                  Import
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => handleExport("breedings")} disabled={exporting !== null}>
                  <Download className="mr-2 h-4 w-4" />
                  Export Breedings CSV
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => handleExport("kids")} disabled={exporting !== null}>
                  <Download className="mr-2 h-4 w-4" />
                  Export Kids CSV
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Link href="/breedings/new">
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-md">
                <Plus className="mr-2 h-4 w-4" />
                Record Breeding
              </Button>
            </Link>
          </div>
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
          <div className="space-y-6">
            <div className="flex justify-end">
              <SortSelect value={sort} onChange={setSort} options={BREEDING_SORT_OPTIONS} />
            </div>
            <div className="space-y-10">
            {active.length > 0 && (
              <section>
                <h3 className="text-lg font-serif font-semibold text-foreground mb-4 flex items-center gap-2">
                  <Heart className="h-4 w-4 text-primary" />
                  Active ({active.length})
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {active.map((b) => <BreedingCard key={b.id} breeding={b} onExposureAction={openDialog} showAi={usesAi} />)}
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
                  {past.map((b) => <BreedingCard key={b.id} breeding={b} onExposureAction={openDialog} showAi={usesAi} />)}
                </div>
              </section>
            )}
            </div>
          </div>
        )}
      </div>

      <Dialog open={dialogState !== null} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle className="font-serif flex items-center gap-2">
              {dialogState?.eventType === "exposed" ? (
                <><LogIn className="h-4 w-4 text-amber-600" /> Log Exposure</>
              ) : dialogState?.eventType === "cover" ? (
                <><Flame className="h-4 w-4 text-rose-600" /> Log Cover</>
              ) : (
                <><LogOut className="h-4 w-4 text-muted-foreground" /> Log Removal</>
              )}
            </DialogTitle>
            <DialogDescription>
              {dialogState?.eventType === "exposed"
                ? `Record when ${dialogState?.doeName} was put in with the buck.`
                : dialogState?.eventType === "cover"
                ? `Record a witnessed breeding (cover) for ${dialogState?.doeName}.`
                : `Record when ${dialogState?.doeName} was removed from the buck.`}
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <div>
              <Label htmlFor="event-date" className="text-sm mb-1.5 block">Date</Label>
              <Input
                id="event-date"
                type="date"
                value={dialogDate}
                onChange={(e) => setDialogDate(e.target.value)}
                className="bg-background/50"
              />
            </div>
            <div>
              <Label htmlFor="event-notes" className="text-sm mb-1.5 block">Notes <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Textarea
                id="event-notes"
                placeholder={
                  dialogState?.eventType === "exposed"
                    ? "e.g. Put in with buck pen overnight"
                    : dialogState?.eventType === "cover"
                    ? "e.g. Very vigorous mating, observed twice"
                    : "e.g. Removed after 3 weeks, no further heat seen"
                }
                value={dialogNotes}
                onChange={(e) => setDialogNotes(e.target.value)}
                className="bg-background/50 resize-none"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={closeDialog} disabled={createEvent.isPending}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleConfirm}
              disabled={!dialogDate || createEvent.isPending}
              className={
                dialogState?.eventType === "exposed"
                  ? "bg-amber-600 hover:bg-amber-700 text-white"
                  : dialogState?.eventType === "cover"
                  ? "bg-rose-600 hover:bg-rose-700 text-white"
                  : ""
              }
            >
              {createEvent.isPending ? (
                <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Saving…</>
              ) : dialogState?.eventType === "exposed" ? (
                "Log Exposure"
              ) : dialogState?.eventType === "cover" ? (
                "Log Cover"
              ) : (
                "Log Removal"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
