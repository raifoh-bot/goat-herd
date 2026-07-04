import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { AlertTriangle, ArrowLeft, Baby, Calendar, CheckCircle2, Edit3, Eye, Heart, LogOut, Milk, Plus, RefreshCw, Trash2, XCircle, Zap } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { formatDate } from "@/lib/date";
import { useFarmSettings, weightUnitLabel } from "@/lib/settings";
import {
  getGetBreedingQueryKey,
  getListBreedingsQueryKey,
  getListGoatsQueryKey,
  useAddKids,
  useCreateBreedingEvent,
  useCreatePregnancyTest,
  useUpdateBreedingEvent,
  useDeleteBreeding,
  useDeleteBreedingEvent,
  useDeleteKid,
  useGetBreeding,
  useUpdateBreeding,
  useUpdateKid,
} from "@workspace/api-client-react";
import type { BreedingEvent, Kid, PregnancyTest } from "@workspace/api-client-react/src/generated/api.schemas";

const statusConfig = {
  bred: { label: "Bred", icon: Heart, className: "bg-secondary text-secondary-foreground" },
  "confirmed-pregnant": { label: "Confirmed Pregnant", icon: CheckCircle2, className: "bg-chart-1 text-primary-foreground" },
  kidded: { label: "Kidded", icon: Baby, className: "bg-primary text-primary-foreground" },
  open: { label: "Open (Did Not Take)", icon: XCircle, className: "bg-destructive text-destructive-foreground" },
};


const updateSchema = z.object({
  status: z.enum(["bred", "confirmed-pregnant", "kidded", "open"]),
  breedingDate: z.string().min(1, "Breeding date is required"),
  notes: z.string().optional(),
  expectedKiddingDate: z.string().optional(),
});

const kiddingSchema = z.object({
  birthDate: z.string().min(1, "Birth date is required"),
  kids: z.array(z.object({
    name: z.string().optional(),
    sex: z.enum(["doe", "buck"]),
    kidStatus: z.enum(["alive", "doa", "sold"]),
    birthWeight: z.coerce.number().min(0).optional().or(z.literal("")),
    notes: z.string().optional(),
  })).min(1, "Add at least one kid"),
});

type UpdateValues = z.infer<typeof updateSchema>;
type KiddingValues = z.infer<typeof kiddingSchema>;

const editKidSchema = z.object({
  name: z.string().optional(),
  sex: z.enum(["doe", "buck"]),
  kidStatus: z.enum(["alive", "doa", "sold"]),
  birthDate: z.string().optional(),
  birthWeight: z.union([z.string(), z.number()]).optional(),
  notes: z.string().optional(),
});
type EditKidValues = z.infer<typeof editKidSchema>;

function KidCard({ kid, breedingId }: { kid: Kid; breedingId: number }) {
  const { weightUnit } = useFarmSettings();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const updateKid = useUpdateKid();
  const deleteKid = useDeleteKid();

  const isDoa = kid.kidStatus === "doa";
  const sexLabel = kid.sex === "doe" ? "Doe ♀" : "Buck ♂";
  const sexClass = kid.sex === "doe" ? "bg-secondary text-secondary-foreground" : "bg-muted text-muted-foreground";

  const editForm = useForm<EditKidValues>({
    resolver: zodResolver(editKidSchema),
    values: {
      name: kid.name ?? "",
      sex: kid.sex as "doe" | "buck",
      kidStatus: (kid.kidStatus ?? "alive") as "alive" | "doa",
      birthDate: kid.birthDate ? new Date(kid.birthDate).toISOString().slice(0, 10) : "",
      birthWeight: kid.birthWeight ?? "",
      notes: kid.notes ?? "",
    },
  });

  const handleSave = (data: EditKidValues) => {
    updateKid.mutate(
      {
        id: breedingId,
        kidId: kid.id,
        data: {
          name: data.name || undefined,
          sex: data.sex,
          kidStatus: data.kidStatus,
          birthDate: data.birthDate ? new Date(data.birthDate).toISOString() : undefined,
          birthWeight: data.birthWeight !== "" && data.birthWeight !== undefined ? Number(data.birthWeight) : undefined,
          notes: data.notes || undefined,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Kid updated" });
          setIsEditing(false);
          queryClient.invalidateQueries({ queryKey: getGetBreedingQueryKey(breedingId) });
          queryClient.invalidateQueries({ queryKey: getListGoatsQueryKey() });
        },
        onError: () => toast({ title: "Update failed", variant: "destructive" }),
      }
    );
  };

  const handleDelete = () => {
    deleteKid.mutate(
      { id: breedingId, kidId: kid.id },
      {
        onSuccess: () => {
          toast({ title: "Kid removed" });
          setIsDeleting(false);
          queryClient.invalidateQueries({ queryKey: getGetBreedingQueryKey(breedingId) });
          queryClient.invalidateQueries({ queryKey: getListBreedingsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListGoatsQueryKey() });
        },
        onError: () => toast({ title: "Delete failed", variant: "destructive" }),
      }
    );
  };

  return (
    <>
      <div className={`flex items-center gap-4 p-4 rounded-xl border border-border bg-card/50 ${isDoa ? "opacity-60" : ""}`}>
        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
          <Baby className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <span className="font-medium text-foreground">{kid.name || "Unnamed"}</span>
            <Badge className={`${sexClass} text-xs px-2 py-0`}>{sexLabel}</Badge>
            {isDoa && <Badge className="bg-destructive/20 text-destructive text-xs px-2 py-0">DOA</Badge>}
            {kid.kidStatus === "dead" && <Badge className="bg-destructive/10 text-destructive/70 text-xs px-2 py-0">Dead</Badge>}
            {kid.kidStatus === "sold" && <Badge className="bg-muted text-muted-foreground text-xs px-2 py-0">Sold</Badge>}
          </div>
          <div className="text-sm sm:text-xs text-muted-foreground">
            {kid.birthWeight ? `${kid.birthWeight} ${weightUnitLabel(weightUnit)}` : null}
            {kid.birthDate ? ` • Born ${formatDate(kid.birthDate, { month: "short", day: "numeric", year: "numeric" })}` : null}
            {kid.notes ? ` • ${kid.notes}` : null}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button variant="ghost" size="sm" onClick={() => setIsEditing(true)} className="h-10 w-10 p-0 text-muted-foreground hover:text-foreground">
            <Edit3 className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setIsDeleting(true)} className="h-10 w-10 p-0 text-muted-foreground hover:text-destructive">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <Dialog open={isEditing} onOpenChange={setIsEditing}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="font-serif">Edit Kid Record</DialogTitle>
            <DialogDescription>Update the details for {kid.name || "this kid"}.</DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(handleSave)} className="space-y-4 mt-2">
              <div className="grid grid-cols-2 gap-4">
                <FormField control={editForm.control} name="name" render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Name (Optional)</FormLabel>
                    <FormControl><Input placeholder="Kid's name" {...field} className="bg-background/50" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={editForm.control} name="sex" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sex</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="bg-background/50"><SelectValue /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="doe">Doe ♀</SelectItem>
                        <SelectItem value="buck">Buck ♂</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={editForm.control} name="kidStatus" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="bg-background/50"><SelectValue /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="alive">Alive</SelectItem>
                        <SelectItem value="sold">Sold</SelectItem>
                        <SelectItem value="dead">Dead</SelectItem>
                        <SelectItem value="doa">DOA</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={editForm.control} name="birthDate" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Birth Date</FormLabel>
                    <FormControl><Input type="date" {...field} className="bg-background/50" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={editForm.control} name="birthWeight" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Birth Weight ({weightUnitLabel(weightUnit)})</FormLabel>
                    <FormControl><Input type="number" step="0.1" placeholder="e.g. 4.2" {...field} className="bg-background/50" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={editForm.control} name="notes" render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Notes (Optional)</FormLabel>
                    <FormControl><Textarea className="bg-background/50 resize-none" rows={2} {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <DialogFooter className="gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setIsEditing(false)}>Cancel</Button>
                <Button type="submit" disabled={updateKid.isPending}>
                  {updateKid.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={isDeleting} onOpenChange={setIsDeleting}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-serif">Remove Kid?</DialogTitle>
            <DialogDescription>
              This will remove <strong>{kid.name || "this kid"}</strong> from the kidding record.
              {kid.goatId ? " The goat record in The Herd will not be deleted." : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setIsDeleting(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteKid.isPending}>
              {deleteKid.isPending ? "Removing..." : "Remove Kid"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

const GESTATION_DAYS = 145;

const eventConfig = {
  exposed: { label: "Exposure Start", fullLabel: "Doe placed with buck", icon: Eye, dotClass: "bg-blue-500/20 border-blue-300", iconClass: "text-blue-600", badgeClass: "bg-blue-100 text-blue-700 border-blue-200" },
  cover: { label: "Cover Witnessed", fullLabel: "Breeding observed", icon: Heart, dotClass: "bg-rose-500/20 border-rose-300", iconClass: "text-rose-600", badgeClass: "bg-rose-100 text-rose-700 border-rose-200" },
  removed: { label: "Doe Removed", fullLabel: "Doe removed from buck", icon: LogOut, dotClass: "bg-muted border-border", iconClass: "text-muted-foreground", badgeClass: "bg-muted text-muted-foreground border-border" },
} as const;
type EventType = keyof typeof eventConfig;

const eventFormSchema = z.object({
  eventType: z.enum(["exposed", "cover", "removed"]),
  eventDate: z.string().min(1, "Date is required"),
  notes: z.string().optional(),
});
type EventFormValues = z.infer<typeof eventFormSchema>;

const editEventSchema = z.object({
  eventDate: z.string().min(1, "Date is required"),
  notes: z.string().optional(),
});
type EditEventValues = z.infer<typeof editEventSchema>;

function TimelineEvent({
  event,
  breedingId,
  isLast,
  isLatestCover,
}: {
  event: BreedingEvent;
  breedingId: number;
  isLast: boolean;
  isLatestCover: boolean;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const updateEvent = useUpdateBreedingEvent();
  const deleteEvent = useDeleteBreedingEvent();

  const cfg = eventConfig[event.eventType as EventType] ?? eventConfig.exposed;
  const Icon = cfg.icon;
  const isCover = event.eventType === "cover";
  const projectedKiddingDate = isCover
    ? new Date(new Date(event.eventDate).getTime() + GESTATION_DAYS * 24 * 60 * 60 * 1000)
    : null;

  const editForm = useForm<EditEventValues>({
    resolver: zodResolver(editEventSchema),
    values: {
      eventDate: new Date(event.eventDate).toISOString().slice(0, 10),
      notes: event.notes ?? "",
    },
  });

  const openEdit = () => {
    editForm.reset({
      eventDate: new Date(event.eventDate).toISOString().slice(0, 10),
      notes: event.notes ?? "",
    });
    setIsEditing(true);
  };

  const handleEdit = (data: EditEventValues) => {
    updateEvent.mutate(
      {
        id: breedingId,
        eventId: event.id,
        data: { eventDate: new Date(data.eventDate + "T12:00:00").toISOString(), notes: data.notes || undefined },
      },
      {
        onSuccess: () => {
          toast({ title: "Event updated" });
          setIsEditing(false);
          queryClient.invalidateQueries({ queryKey: getGetBreedingQueryKey(breedingId) });
        },
        onError: () => toast({ title: "Failed to update event", variant: "destructive" }),
      }
    );
  };

  const handleDelete = () => {
    deleteEvent.mutate(
      { id: breedingId, eventId: event.id },
      {
        onSuccess: () => {
          toast({ title: "Event removed" });
          queryClient.invalidateQueries({ queryKey: getGetBreedingQueryKey(breedingId) });
        },
        onError: () => toast({ title: "Failed to remove event", variant: "destructive" }),
      }
    );
  };

  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center shrink-0">
        <div className={`h-7 w-7 rounded-full border flex items-center justify-center ${isCover ? "bg-rose-500/25 border-rose-400" : cfg.dotClass}`}>
          <Icon className={`h-3.5 w-3.5 ${cfg.iconClass}`} />
        </div>
        {!isLast && <div className="w-px flex-1 bg-border my-1 min-h-[16px]" />}
      </div>
      <div className="flex-1 pb-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-0.5">
              <span className="font-medium text-sm text-foreground">{cfg.label}</span>
              <Badge className={`${cfg.badgeClass} text-xs px-2 py-0 border`}>{cfg.fullLabel}</Badge>
              {isLatestCover && (
                <Badge className="bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-700 text-xs px-2 py-0 border">
                  Active estimate
                </Badge>
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              {formatDate(event.eventDate, { month: "short", day: "numeric", year: "numeric" })}
              {event.notes && <> · <span className="italic">{event.notes}</span></>}
            </div>
            {isCover && projectedKiddingDate && (
              <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-md bg-rose-50 dark:bg-rose-950/30 border border-rose-200/60 dark:border-rose-800/40 px-2 py-1 text-xs text-rose-700 dark:text-rose-300">
                <Baby className="h-3 w-3 shrink-0" />
                <span>Est. kidding: <span className="font-medium">{formatDate(projectedKiddingDate.toISOString(), { month: "short", day: "numeric", year: "numeric" })}</span></span>
                <span className="text-rose-400 dark:text-rose-500">(+{GESTATION_DAYS} days)</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            <Button
              variant="ghost" size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
              onClick={openEdit}
            >
              <Edit3 className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost" size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
              onClick={handleDelete}
              disabled={deleteEvent.isPending}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={isEditing} onOpenChange={setIsEditing}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="font-serif">Edit {cfg.label}</DialogTitle>
            <DialogDescription>Update the date or notes for this event.</DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(handleEdit)} className="space-y-4 mt-2">
              <FormField control={editForm.control} name="eventDate" render={({ field }) => (
                <FormItem>
                  <FormLabel>Date</FormLabel>
                  <FormControl><Input type="date" {...field} className="bg-background/50" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={editForm.control} name="notes" render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes (optional)</FormLabel>
                  <FormControl>
                    <Textarea className="bg-background/50 resize-none" rows={2} placeholder="e.g. Buck was attentive, observed 2 covers" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsEditing(false)}>Cancel</Button>
                <Button type="submit" disabled={updateEvent.isPending}>
                  {updateEvent.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ExposureWindowSummary({ events }: { events: BreedingEvent[] }) {
  const exposedEvents = events.filter((e) => e.eventType === "exposed");
  const removedEvents = events.filter((e) => e.eventType === "removed");
  const coverCount = events.filter((e) => e.eventType === "cover").length;

  if (exposedEvents.length === 0) return null;

  const firstExposure = exposedEvents.reduce((earliest, e) =>
    new Date(e.eventDate) < new Date(earliest.eventDate) ? e : earliest
  );
  const lastRemoval = removedEvents.length > 0
    ? removedEvents.reduce((latest, e) =>
        new Date(e.eventDate) > new Date(latest.eventDate) ? e : latest
      )
    : null;

  const toUtcDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const startDate = new Date(firstExposure.eventDate);
  const endDate = lastRemoval ? new Date(lastRemoval.eventDate) : new Date();
  const totalDays = Math.max(0, Math.floor((toUtcDay(endDate) - toUtcDay(startDate)) / (1000 * 60 * 60 * 24)));

  return (
    <div className="mb-5 rounded-xl border border-blue-200/60 bg-blue-50/40 dark:bg-blue-950/20 dark:border-blue-800/40 p-4">
      <div className="text-xs uppercase tracking-wide text-blue-700/70 dark:text-blue-400/70 mb-3 font-medium">Exposure Window Summary</div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <div className="text-xs text-muted-foreground mb-0.5">First Exposed</div>
          <div className="text-sm font-medium text-foreground">
            {formatDate(firstExposure.eventDate, { month: "short", day: "numeric", year: "numeric" })}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground mb-0.5">Last Removed</div>
          <div className="text-sm font-medium text-foreground">
            {lastRemoval
              ? formatDate(lastRemoval.eventDate, { month: "short", day: "numeric", year: "numeric" })
              : <span className="text-muted-foreground italic">Still in with buck</span>}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground mb-0.5">Days Exposed</div>
          <div className="text-sm font-medium text-foreground">
            {totalDays} day{totalDays !== 1 ? "s" : ""}
            {!lastRemoval && <span className="text-xs text-muted-foreground ml-1">(ongoing)</span>}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground mb-0.5">Covers Witnessed</div>
          <div className="text-sm font-medium text-foreground">
            {coverCount === 0 ? <span className="text-muted-foreground">None logged</span> : `${coverCount} cover${coverCount !== 1 ? "s" : ""}`}
          </div>
        </div>
      </div>
    </div>
  );
}

function ExposureTimeline({ events, breedingId, isAi = false }: { events: BreedingEvent[]; breedingId: number; isAi?: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);

  const createEvent = useCreateBreedingEvent();

  const form = useForm<EventFormValues>({
    resolver: zodResolver(eventFormSchema),
    defaultValues: {
      eventType: "exposed",
      eventDate: new Date().toISOString().slice(0, 10),
      notes: "",
    },
  });

  const openDialog = (type: EventType) => {
    form.reset({
      eventType: type,
      eventDate: new Date().toISOString().slice(0, 10),
      notes: "",
    });
    setDialogOpen(true);
  };

  const handleSubmit = (data: EventFormValues) => {
    createEvent.mutate(
      { id: breedingId, data: { eventType: data.eventType, eventDate: new Date(data.eventDate + "T12:00:00").toISOString(), notes: data.notes || undefined } },
      {
        onSuccess: () => {
          toast({ title: `${eventConfig[data.eventType].label} logged` });
          setDialogOpen(false);
          queryClient.invalidateQueries({ queryKey: getGetBreedingQueryKey(breedingId) });
        },
        onError: () => toast({ title: "Failed to log event", variant: "destructive" }),
      }
    );
  };

  return (
    <Card className="border-primary/10 shadow-md">
      <CardHeader>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardTitle className="font-serif flex items-center gap-2">
            {isAi ? <Heart className="h-5 w-5 text-primary" /> : <Eye className="h-5 w-5 text-primary" />}
            {isAi ? "Insemination & Covers" : "Exposure Timeline"}
          </CardTitle>
          <div className="flex gap-2 flex-wrap">
            {!isAi && (
              <Button variant="outline" size="sm" onClick={() => openDialog("exposed")}>
                <Eye className="mr-1.5 h-3.5 w-3.5" /> Log Exposure
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => openDialog("cover")}>
              <Heart className="mr-1.5 h-3.5 w-3.5" /> Log Cover
            </Button>
            {!isAi && (
              <Button variant="outline" size="sm" onClick={() => openDialog("removed")}>
                <LogOut className="mr-1.5 h-3.5 w-3.5" /> Log Removal
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {!isAi && <ExposureWindowSummary events={events} />}
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            {isAi
              ? "No covers logged yet. Use “Log Cover” to record the insemination/breeding date."
              : "No events logged yet. Use the buttons above to track when the doe was exposed, covers were witnessed, or the doe was removed."}
          </p>
        ) : (
          <div className="space-y-0">
            {(() => {
              const coverEvents = events.filter((e) => e.eventType === "cover");
              const latestCoverId = coverEvents.length > 0
                ? coverEvents.reduce((latest, e) =>
                    new Date(e.eventDate) > new Date(latest.eventDate) ? e : latest
                  ).id
                : null;
              return events.map((event, idx) => {
                const isLast = idx === events.length - 1;
                const isLatestCover = event.eventType === "cover" && event.id === latestCoverId;
                return (
                  <TimelineEvent
                    key={event.id}
                    event={event}
                    breedingId={breedingId}
                    isLast={isLast}
                    isLatestCover={isLatestCover}
                  />
                );
              });
            })()}
          </div>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="font-serif">Log Timeline Event</DialogTitle>
            <DialogDescription>Record an exposure, observed cover, or removal for this breeding.</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4 mt-2">
              <FormField control={form.control} name="eventType" render={({ field }) => (
                <FormItem>
                  <FormLabel>Event Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="bg-background/50"><SelectValue /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="exposed">Exposure Start — doe placed with buck</SelectItem>
                      <SelectItem value="cover">Cover Witnessed — breeding observed</SelectItem>
                      <SelectItem value="removed">Doe Removed — taken out of buck's pen</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="eventDate" render={({ field }) => (
                <FormItem>
                  <FormLabel>Date</FormLabel>
                  <FormControl><Input type="date" {...field} className="bg-background/50" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes (optional)</FormLabel>
                  <FormControl>
                    <Textarea className="bg-background/50 resize-none" rows={2} placeholder="e.g. Buck was attentive, observed 2 covers" {...field} />
                  </FormControl>
                </FormItem>
              )} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={createEvent.isPending}>
                  {createEvent.isPending ? "Saving..." : "Log Event"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

const testMethodConfig: Record<string, string> = {
  ultrasound: "Ultrasound",
  blood: "Blood Test",
  palpation: "Palpation",
  other: "Other",
};

const testResultConfig: Record<string, { label: string; badgeClass: string }> = {
  positive: { label: "Positive", badgeClass: "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700" },
  negative: { label: "Negative", badgeClass: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700" },
  inconclusive: { label: "Inconclusive", badgeClass: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700" },
};

function PregnancyTestsCard({
  tests,
  breedingId,
  canRecord,
}: {
  tests: PregnancyTest[];
  breedingId: number;
  canRecord: boolean;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [step, setStep] = useState<"details" | "action">("details");

  const [testDate, setTestDate] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState<PregnancyTest["method"]>("ultrasound");
  const [result, setResult] = useState<PregnancyTest["result"]>("positive");
  const [testedBy, setTestedBy] = useState("");
  const [notes, setNotes] = useState("");
  const [addCover, setAddCover] = useState(false);
  const [coverDate, setCoverDate] = useState(new Date().toISOString().slice(0, 10));
  const [coverNotes, setCoverNotes] = useState("");

  const createTest = useCreatePregnancyTest();

  const resetForm = () => {
    setStep("details");
    setTestDate(new Date().toISOString().slice(0, 10));
    setMethod("ultrasound");
    setResult("positive");
    setTestedBy("");
    setNotes("");
    setAddCover(false);
    setCoverDate(new Date().toISOString().slice(0, 10));
    setCoverNotes("");
  };

  const handleOpenChange = (open: boolean) => {
    setDialogOpen(open);
    if (!open) resetForm();
  };

  const submit = (opts: { confirmPregnancy?: boolean; markOpen?: boolean } = {}) => {
    createTest.mutate(
      {
        id: breedingId,
        data: {
          testDate: new Date(testDate + "T12:00:00").toISOString(),
          method,
          result,
          testedBy: testedBy.trim() || undefined,
          notes: notes.trim() || undefined,
          confirmPregnancy: opts.confirmPregnancy || undefined,
          markOpen: opts.markOpen || undefined,
          addCoverEvent:
            opts.markOpen && addCover
              ? { eventDate: new Date(coverDate + "T12:00:00").toISOString(), notes: coverNotes.trim() || undefined }
              : undefined,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Pregnancy test recorded" });
          handleOpenChange(false);
          queryClient.invalidateQueries({ queryKey: getGetBreedingQueryKey(breedingId) });
          queryClient.invalidateQueries({ queryKey: getListBreedingsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListGoatsQueryKey() });
        },
        onError: () => toast({ title: "Failed to record test", variant: "destructive" }),
      }
    );
  };

  const handleContinue = () => {
    // Inconclusive has no follow-up action — save immediately.
    if (result === "inconclusive") {
      submit();
    } else {
      setStep("action");
    }
  };

  return (
    <Card className="border-primary/10 shadow-md">
      <CardHeader>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardTitle className="font-serif flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" /> Pregnancy Tests
          </CardTitle>
          {canRecord && (
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Record Pregnancy Test
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {tests.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No tests recorded yet.</p>
        ) : (
          <ul className="space-y-3">
            {tests.map((t) => (
              <li key={t.id} className="rounded-xl border border-border bg-card/50 p-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className={`${testResultConfig[t.result]?.badgeClass ?? ""} text-xs px-2 py-0 border`}>
                      {testResultConfig[t.result]?.label ?? t.result}
                    </Badge>
                    <span className="text-sm font-medium text-foreground">{testMethodConfig[t.method] ?? t.method}</span>
                  </div>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" /> {formatDate(t.testDate)}
                  </span>
                </div>
                {(t.testedBy || t.notes) && (
                  <div className="mt-2 text-sm text-muted-foreground space-y-1">
                    {t.testedBy && <p>Tested by {t.testedBy}</p>}
                    {t.notes && <p className="leading-relaxed">{t.notes}</p>}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle className="font-serif">Record Pregnancy Test</DialogTitle>
            <DialogDescription>
              {step === "details"
                ? "Log the test date, method, and result."
                : result === "positive"
                ? "This test is positive. Confirm the pregnancy?"
                : "This test is negative. Close out this cycle?"}
            </DialogDescription>
          </DialogHeader>

          {step === "details" ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Test Date</label>
                  <Input type="date" value={testDate} onChange={(e) => setTestDate(e.target.value)} className="bg-background/50" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Method</label>
                  <Select value={method} onValueChange={(v) => setMethod(v as PregnancyTest["method"])}>
                    <SelectTrigger className="bg-background/50"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ultrasound">Ultrasound</SelectItem>
                      <SelectItem value="blood">Blood Test</SelectItem>
                      <SelectItem value="palpation">Palpation</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Result</label>
                <Select value={result} onValueChange={(v) => setResult(v as PregnancyTest["result"])}>
                  <SelectTrigger className="bg-background/50"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="positive">Positive</SelectItem>
                    <SelectItem value="negative">Negative</SelectItem>
                    <SelectItem value="inconclusive">Inconclusive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Tested By <span className="text-muted-foreground font-normal">(optional)</span></label>
                <Input value={testedBy} onChange={(e) => setTestedBy(e.target.value)} placeholder="e.g. Dr. Smith" className="bg-background/50" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Notes <span className="text-muted-foreground font-normal">(optional)</span></label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="bg-background/50 resize-none" placeholder="Any observations" />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>Cancel</Button>
                <Button type="button" onClick={handleContinue} disabled={createTest.isPending}>
                  {result === "inconclusive" ? (createTest.isPending ? "Saving..." : "Save Test") : "Continue"}
                </Button>
              </DialogFooter>
            </div>
          ) : result === "positive" ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Confirming will set this breeding to <span className="font-medium text-foreground">Confirmed Pregnant</span> and mark the doe pregnant.
              </p>
              <DialogFooter className="gap-2">
                <Button type="button" variant="outline" onClick={() => setStep("details")}>Back</Button>
                <Button type="button" variant="outline" onClick={() => submit()} disabled={createTest.isPending}>
                  Just Save Test
                </Button>
                <Button type="button" onClick={() => submit({ confirmPregnancy: true })} disabled={createTest.isPending}>
                  {createTest.isPending ? "Saving..." : "Confirm Pregnancy"}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Marking open will set this breeding to <span className="font-medium text-foreground">Open</span> and mark the doe dry.
              </p>
              <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                <input type="checkbox" checked={addCover} onChange={(e) => setAddCover(e.target.checked)} className="h-4 w-4" />
                Log a final cover before closing out
              </label>
              {addCover && (
                <div className="space-y-3 rounded-xl border border-border bg-card/50 p-3">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Cover Date</label>
                    <Input type="date" value={coverDate} onChange={(e) => setCoverDate(e.target.value)} className="bg-background/50" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Cover Notes <span className="text-muted-foreground font-normal">(optional)</span></label>
                    <Input value={coverNotes} onChange={(e) => setCoverNotes(e.target.value)} placeholder="e.g. Final cover attempt" className="bg-background/50" />
                  </div>
                </div>
              )}
              <DialogFooter className="gap-2">
                <Button type="button" variant="outline" onClick={() => setStep("details")}>Back</Button>
                <Button type="button" variant="outline" onClick={() => submit()} disabled={createTest.isPending}>
                  Just Save Test
                </Button>
                <Button type="button" onClick={() => submit({ markOpen: true })} disabled={createTest.isPending}>
                  {createTest.isPending ? "Saving..." : "Mark Doe Open"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export default function BreedingDetail() {
  const params = useParams();
  const id = params.id ? parseInt(params.id, 10) : 0;
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isEditingStatus, setIsEditingStatus] = useState(false);
  const [isAddingKids, setIsAddingKids] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const { usesAi, weightUnit } = useFarmSettings();

  const { data: breeding, isLoading, isError } = useGetBreeding(id, {
    query: { enabled: !!id, queryKey: getGetBreedingQueryKey(id) },
  });

  const updateBreeding = useUpdateBreeding();
  const addKids = useAddKids();
  const deleteBreeding = useDeleteBreeding();

  const updateForm = useForm<UpdateValues>({
    resolver: zodResolver(updateSchema),
    values: breeding ? {
      status: breeding.status,
      breedingDate: new Date(breeding.breedingDate).toISOString().slice(0, 10),
      notes: breeding.notes ?? "",
      expectedKiddingDate: breeding.expectedKiddingDate ? new Date(breeding.expectedKiddingDate).toISOString().slice(0, 10) : "",
    } : undefined,
  });

  const kiddingForm = useForm<KiddingValues>({
    resolver: zodResolver(kiddingSchema),
    defaultValues: {
      birthDate: new Date().toISOString().slice(0, 10),
      kids: [{ name: "", sex: "doe", kidStatus: "alive", birthWeight: "", notes: "" }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control: kiddingForm.control, name: "kids" });

  const handleUpdateStatus = (data: UpdateValues) => {
    const kiddingDate = breeding?.kids?.find((k) => k.birthDate)?.birthDate;
    if (kiddingDate) {
      const bDate = new Date(data.breedingDate);
      const kDate = new Date(kiddingDate);
      if (bDate >= kDate) {
        updateForm.setError("breedingDate", {
          type: "manual",
          message: `Breeding date must be before the kidding date (${kDate.toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" })})`,
        });
        return;
      }
    }
    updateBreeding.mutate(
      {
        id,
        data: {
          status: data.status,
          breedingDate: new Date(data.breedingDate).toISOString(),
          notes: data.notes,
          expectedKiddingDate: data.expectedKiddingDate ? new Date(data.expectedKiddingDate).toISOString() : undefined,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Record updated" });
          setIsEditingStatus(false);
          queryClient.invalidateQueries({ queryKey: getGetBreedingQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getListBreedingsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListGoatsQueryKey() });
        },
        onError: () => toast({ title: "Update failed", variant: "destructive" }),
      }
    );
  };

  const handleRecordKidding = (data: KiddingValues) => {
    if (breeding?.breedingDate) {
      const bDate = new Date(breeding.breedingDate);
      const kDate = new Date(data.birthDate);
      if (kDate <= bDate) {
        kiddingForm.setError("birthDate", {
          type: "manual",
          message: `Kidding date must be after the breeding date (${bDate.toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" })})`,
        });
        return;
      }
    }
    addKids.mutate(
      {
        id,
        data: {
          birthDate: new Date(data.birthDate).toISOString(),
          kids: data.kids.map((k) => ({
            name: k.name || undefined,
            sex: k.sex,
            kidStatus: k.kidStatus,
            birthDate: new Date(data.birthDate).toISOString(),
            birthWeight: k.birthWeight !== "" && k.birthWeight !== undefined ? Number(k.birthWeight) : undefined,
            notes: k.notes || undefined,
          })),
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Kids recorded!", description: `${data.kids.length} kid(s) added successfully.` });
          setIsAddingKids(false);
          kiddingForm.reset({ birthDate: new Date().toISOString().slice(0, 10), kids: [{ name: "", sex: "doe", kidStatus: "alive", birthWeight: "", notes: "" }] });
          queryClient.invalidateQueries({ queryKey: getGetBreedingQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getListBreedingsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListGoatsQueryKey() });
        },
        onError: () => toast({ title: "Failed to record kidding", variant: "destructive" }),
      }
    );
  };

  const handleDelete = () => {
    deleteBreeding.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Record deleted", description: "The kidding record has been removed." });
        queryClient.invalidateQueries({ queryKey: getListBreedingsQueryKey() });
        setLocation("/breedings");
      },
      onError: () => {
        toast({ title: "Delete failed", description: "Could not delete the record.", variant: "destructive" });
        setIsDeleteDialogOpen(false);
      },
    });
  };

  if (isError) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <h2 className="text-2xl font-serif font-bold text-foreground mb-2">Record Not Found</h2>
          <Button onClick={() => setLocation("/breedings")}>Return to Kiddings</Button>
        </div>
      </Layout>
    );
  }

  if (isLoading || !breeding) {
    return (
      <Layout>
        <div className="space-y-6">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-48 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </Layout>
    );
  }

  const config = statusConfig[breeding.status];
  const StatusIcon = config.icon;
  const isAi = usesAi && breeding.breedingMethod === "ai";
  const liveKids = breeding.kids?.filter((k) => k.kidStatus !== "doa") ?? [];
  const doaKids = breeding.kids?.filter((k) => k.kidStatus === "doa") ?? [];

  const events = breeding.events ?? [];
  const latestRelevantEvent = [...events]
    .filter((e) => e.eventType === "exposed" || e.eventType === "removed")
    .sort((a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime())[0];
  const hasActiveExposure = latestRelevantEvent?.eventType === "exposed";
  const currentExposedEvent = hasActiveExposure
    ? [...events]
        .filter((e) => e.eventType === "exposed")
        .sort((a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime())[0]
    : null;
  const exposedDays = currentExposedEvent
    ? Math.floor((Date.now() - new Date(currentExposedEvent.eventDate).getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  // Sync detection: compare stored expectedKiddingDate with what covers would predict
  const latestCoverEvent = [...events]
    .filter((e) => e.eventType === "cover")
    .sort((a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime())[0] ?? null;
  const coverDerivedDate = latestCoverEvent
    ? new Date(new Date(latestCoverEvent.eventDate).getTime() + GESTATION_DAYS * 24 * 60 * 60 * 1000)
    : null;
  const isKiddingDateOutOfSync =
    breeding.expectedKiddingDate != null &&
    coverDerivedDate != null &&
    Math.abs(new Date(breeding.expectedKiddingDate).getTime() - coverDerivedDate.getTime()) > 24 * 60 * 60 * 1000;

  return (
    <Layout>
      <div className="space-y-6 animate-in fade-in duration-500 max-w-3xl mx-auto">
        <div className="flex items-center justify-between gap-4">
          <Button variant="ghost" size="sm" onClick={() => setLocation("/breedings")} className="text-muted-foreground hover:text-foreground -ml-4">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Kiddings
          </Button>
          <div className="flex items-center gap-2">
            {!isEditingStatus && (
              <Button variant="outline" size="sm" onClick={() => setIsEditingStatus(true)}>
                <Edit3 className="mr-2 h-3.5 w-3.5" /> Update Status
              </Button>
            )}
            <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="destructive" size="icon" className="shadow-sm">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="font-serif">Delete Kidding Record?</DialogTitle>
                  <DialogDescription>
                    This will permanently delete the breeding record for{" "}
                    <strong>{breeding?.doe?.name ?? "this doe"}</strong> × <strong>{breeding?.sireName}</strong>,
                    including all kid records. This cannot be undone.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter className="mt-6">
                  <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>Cancel</Button>
                  <Button variant="destructive" onClick={handleDelete} disabled={deleteBreeding.isPending}>
                    {deleteBreeding.isPending ? "Deleting..." : "Delete Record"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <Card className="border-primary/10 shadow-md">
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="font-serif text-2xl">{breeding.doe?.name ?? `Doe #${breeding.doeId}`}</CardTitle>
                <p className="text-muted-foreground mt-1">× <span className="font-medium text-foreground">{breeding.sireName}</span></p>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <Badge className={`${config.className} flex items-center gap-1.5 px-3 py-1.5 text-sm`}>
                  <StatusIcon className="h-3.5 w-3.5" />
                  {config.label}
                </Badge>
                {isAi && (
                  <Badge className="bg-violet-500/15 text-violet-700 border border-violet-400/40 flex items-center gap-1.5 px-3 py-1.5 text-sm dark:text-violet-300 dark:bg-violet-500/10">
                    <Zap className="h-3.5 w-3.5" />
                    AI
                  </Badge>
                )}
                {!isAi && hasActiveExposure && (
                  <Badge className="bg-amber-500/15 text-amber-700 border border-amber-400/40 flex items-center gap-1.5 px-3 py-1.5 text-sm dark:text-amber-400 dark:bg-amber-500/10">
                    <Zap className="h-3.5 w-3.5" />
                    Exposed{exposedDays > 0 ? ` ${exposedDays} day${exposedDays !== 1 ? "s" : ""}` : ""}{currentExposedEvent ? ` · Since ${formatDate(currentExposedEvent.eventDate, { month: "short", day: "numeric", year: "numeric" })}` : ""}
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-xl border border-border bg-card/50 p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1.5"><Calendar className="h-3 w-3" /> {isAi ? "Insemination Date" : "Breeding Date"}</div>
                <div className="font-medium text-foreground">{formatDate(breeding.breedingDate)}</div>
              </div>
              <div className={`rounded-xl border p-4 ${isKiddingDateOutOfSync ? "border-amber-300 bg-amber-50/50 dark:bg-amber-950/10" : "border-border bg-primary/5"}`}>
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1.5"><Baby className="h-3 w-3" /> Estimated Kidding Date</div>
                <div className="font-medium text-foreground">
                  {breeding.expectedKiddingDate
                    ? formatDate(breeding.expectedKiddingDate)
                    : formatDate(new Date(new Date(breeding.breedingDate).getTime() + GESTATION_DAYS * 24 * 60 * 60 * 1000))}
                </div>
                <div className="text-xs text-muted-foreground/70 mt-0.5">
                  {breeding.expectedKiddingDate ? `Most recent cover + ${GESTATION_DAYS} days` : `Breeding date + ${GESTATION_DAYS} days`}
                </div>
                {isKiddingDateOutOfSync && coverDerivedDate && (
                  <div className="mt-2 pt-2 border-t border-amber-200 dark:border-amber-800/40">
                    <div className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400 mb-1.5">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      <span>Doesn't match latest cover (+{GESTATION_DAYS} days = <strong>{formatDate(coverDerivedDate)}</strong>)</span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-900/30"
                      disabled={updateBreeding.isPending}
                      onClick={() =>
                        updateBreeding.mutate(
                          { id, data: { expectedKiddingDate: coverDerivedDate.toISOString() } },
                          {
                            onSuccess: () => {
                              toast({ title: "Kidding date synced to latest cover" });
                              queryClient.invalidateQueries({ queryKey: getGetBreedingQueryKey(id) });
                            },
                            onError: () => toast({ title: "Update failed", variant: "destructive" }),
                          }
                        )
                      }
                    >
                      <RefreshCw className="h-3 w-3 mr-1.5" />
                      {updateBreeding.isPending ? "Updating..." : "Sync to latest cover"}
                    </Button>
                  </div>
                )}
              </div>
              {breeding.doe?.breed && (
                <div className="rounded-xl border border-border bg-card/50 p-4">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1.5"><Milk className="h-3 w-3" /> Doe Breed</div>
                  <div className="font-medium text-foreground capitalize">{breeding.doe.breed}</div>
                </div>
              )}
              {isAi && breeding.semenSource && (
                <div className="rounded-xl border border-border bg-card/50 p-4">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1.5"><Zap className="h-3 w-3" /> Semen Source</div>
                  <div className="font-medium text-foreground">{breeding.semenSource}</div>
                </div>
              )}
            </div>

            {breeding.notes && (
              <div className="rounded-xl border border-border bg-card/50 p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Notes</div>
                <p className="text-sm text-foreground leading-relaxed">{breeding.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <ExposureTimeline events={breeding.events ?? []} breedingId={id} isAi={isAi} />

        <PregnancyTestsCard
          tests={breeding.pregnancyTests ?? []}
          breedingId={id}
          canRecord={breeding.status === "bred" || breeding.status === "confirmed-pregnant"}
        />

        {isEditingStatus && (
          <Card className="border-primary/10 shadow-md">
            <CardHeader>
              <CardTitle className="font-serif text-lg">Update Status</CardTitle>
            </CardHeader>
            <CardContent>
              <Form {...updateForm}>
                <form onSubmit={updateForm.handleSubmit(handleUpdateStatus)} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField
                      control={updateForm.control}
                      name="breedingDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Breeding Date</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} className="bg-background/50" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={updateForm.control}
                      name="status"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Status</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger className="bg-background/50">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="bred">Bred</SelectItem>
                              <SelectItem value="confirmed-pregnant">Confirmed Pregnant</SelectItem>
                              <SelectItem value="kidded">Kidded</SelectItem>
                              <SelectItem value="open">Open (Did Not Take)</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={updateForm.control}
                      name="expectedKiddingDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Expected Kidding Date</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} className="bg-background/50" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={updateForm.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Notes</FormLabel>
                        <FormControl>
                          <Textarea className="bg-background/50 resize-none" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="flex gap-2">
                    <Button type="submit" disabled={updateBreeding.isPending}>
                      {updateBreeding.isPending ? "Saving..." : "Save Changes"}
                    </Button>
                    <Button type="button" variant="outline" onClick={() => setIsEditingStatus(false)}>Cancel</Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        )}

        {breeding.status !== "open" && (
          <Card className="border-primary/10 shadow-md">
            <CardHeader>
              <div className="flex items-center justify-between gap-4">
                <CardTitle className="font-serif flex items-center gap-2">
                  <Baby className="h-5 w-5 text-primary" />
                  Kidding Results
                  {(breeding.kids?.length ?? 0) > 0 && (
                    <span className="text-base font-normal text-muted-foreground">({breeding.kids!.length} kid{breeding.kids!.length !== 1 ? "s" : ""})</span>
                  )}
                </CardTitle>
                {(breeding.kids?.length ?? 0) > 0 && !isAddingKids && (
                  <Button variant="outline" size="sm" onClick={() => setIsAddingKids(true)}>
                    <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Kids
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {(breeding.kids?.length ?? 0) > 0 && (
                <div className="space-y-2">
                  {[...liveKids, ...doaKids].map((kid) => <KidCard key={kid.id} kid={kid} breedingId={id} />)}
                </div>
              )}

              {((breeding.kids?.length ?? 0) === 0 || isAddingKids) && (
                <Form {...kiddingForm}>
                  <form onSubmit={kiddingForm.handleSubmit(handleRecordKidding)} className="space-y-5">
                    <FormField
                      control={kiddingForm.control}
                      name="birthDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Birth Date</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} className="bg-background/50 max-w-[220px]" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium leading-none">Kids Born</p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => append({ name: "", sex: "doe", kidStatus: "alive", birthWeight: "", notes: "" })}
                        >
                          <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Another
                        </Button>
                      </div>

                      {fields.map((field, idx) => (
                        <div key={field.id} className="rounded-xl border border-border bg-card/50 p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold text-foreground">Kid #{idx + 1}</span>
                            {fields.length > 1 && (
                              <Button type="button" variant="ghost" size="sm" onClick={() => remove(idx)} className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive">
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <FormField
                              control={kiddingForm.control}
                              name={`kids.${idx}.sex`}
                              render={({ field: f }) => (
                                <FormItem>
                                  <FormLabel className="text-xs">Sex</FormLabel>
                                  <Select onValueChange={f.onChange} value={f.value}>
                                    <FormControl>
                                      <SelectTrigger className="h-8 bg-background/50">
                                        <SelectValue placeholder="Select sex" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      <SelectItem value="doe">Doe (Female)</SelectItem>
                                      <SelectItem value="buck">Buck (Male)</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={kiddingForm.control}
                              name={`kids.${idx}.kidStatus`}
                              render={({ field: f }) => (
                                <FormItem>
                                  <FormLabel className="text-xs">Status</FormLabel>
                                  <Select onValueChange={f.onChange} value={f.value}>
                                    <FormControl>
                                      <SelectTrigger className="h-8 bg-background/50">
                                        <SelectValue placeholder="Select status" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      <SelectItem value="alive">Alive</SelectItem>
                                      <SelectItem value="sold">Sold</SelectItem>
                                      <SelectItem value="dead">Dead</SelectItem>
                                      <SelectItem value="doa">DOA</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={kiddingForm.control}
                              name={`kids.${idx}.name`}
                              render={({ field: f }) => (
                                <FormItem>
                                  <FormLabel className="text-xs">Name (optional)</FormLabel>
                                  <FormControl>
                                    <Input className="h-8 bg-background/50" placeholder="e.g. Clover" {...f} />
                                  </FormControl>
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={kiddingForm.control}
                              name={`kids.${idx}.birthWeight`}
                              render={({ field: f }) => (
                                <FormItem>
                                  <FormLabel className="text-xs">Weight ({weightUnitLabel(weightUnit)}, optional)</FormLabel>
                                  <FormControl>
                                    <Input className="h-8 bg-background/50" type="number" step="0.1" placeholder="e.g. 6.5" {...f} />
                                  </FormControl>
                                </FormItem>
                              )}
                            />
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="flex gap-2 pt-1">
                      <Button type="submit" disabled={addKids.isPending}>
                        {addKids.isPending ? "Saving..." : `Save ${fields.length} Kid${fields.length !== 1 ? "s" : ""}`}
                      </Button>
                      {isAddingKids && (
                        <Button type="button" variant="outline" onClick={() => setIsAddingKids(false)}>Cancel</Button>
                      )}
                    </div>
                  </form>
                </Form>
              )}

            </CardContent>
          </Card>
        )}

        {breeding.doe && (
          <Card className="border-primary/10 shadow-md">
            <CardHeader>
              <CardTitle className="font-serif text-lg">Doe Record</CardTitle>
            </CardHeader>
            <CardContent>
              <a href={`/goats/${breeding.doe.id}`} className="flex items-center gap-4 p-3 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
                  <Milk className="h-4 w-4" />
                </div>
                <div className="flex-1">
                  <div className="font-medium text-foreground">{breeding.doe.name}</div>
                  <div className="text-sm text-muted-foreground capitalize">{breeding.doe.breed} · {breeding.doe.lactationStatus}</div>
                </div>
                <ArrowLeft className="h-4 w-4 rotate-180 text-muted-foreground" />
              </a>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
