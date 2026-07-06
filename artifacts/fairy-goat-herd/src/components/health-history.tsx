import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListGoatHealthEventsQueryKey,
  useCreateGoatHealthEvent,
  useDeleteGoatHealthEvent,
  useListGoatHealthEvents,
} from "@workspace/api-client-react";
import type {
  HealthEvent,
  HealthEventEventType,
} from "@workspace/api-client-react/src/generated/api.schemas";
import { AlertTriangle, Bug, Droplets, Eye, Footprints, HeartPulse, Loader2, Plus, Scissors, Syringe, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/date";
import { useFarmSettings, weightUnitLabel } from "@/lib/settings";
import { useIsManager } from "@/lib/auth";

export const HEALTH_EVENT_TYPES: {
  value: HealthEventEventType;
  label: string;
  icon: typeof Scissors;
}[] = [
  { value: "hoof_trim", label: "Hoof Trim", icon: Scissors },
  { value: "cdt_shot", label: "CD&T Shot", icon: Syringe },
  { value: "copper_bolus", label: "Copper Bolus", icon: Droplets },
  { value: "famacha", label: "FAMACHA Score", icon: Eye },
  { value: "deworming", label: "Deworming", icon: Bug },
  { value: "other", label: "Other", icon: HeartPulse },
];

export const healthEventTypeConfig = Object.fromEntries(
  HEALTH_EVENT_TYPES.map((t) => [t.value, t]),
) as Record<HealthEventEventType, (typeof HEALTH_EVENT_TYPES)[number]>;

function todayInputValue(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Convert a yyyy-mm-dd input value to an ISO timestamp at local noon. */
export function dateInputToIso(value: string): string {
  return new Date(`${value}T12:00:00`).toISOString();
}

interface AddHealthEventDialogProps {
  goatId: number;
  goatName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Ad hoc single-goat health event entry — used when something is observed in
 * the field (pale eyelids, limping, scours) and treated on the spot.
 */
export function AddHealthEventDialog({ goatId, goatName, open, onOpenChange }: AddHealthEventDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { famachaThreshold, weightUnit } = useFarmSettings();
  const createEvent = useCreateGoatHealthEvent();

  const [eventType, setEventType] = useState<HealthEventEventType>("hoof_trim");
  const [eventDate, setEventDate] = useState(todayInputValue());
  const [famachaScore, setFamachaScore] = useState<string>("");
  const [dosageMl, setDosageMl] = useState("");
  const [bodyWeight, setBodyWeight] = useState("");
  const [productName, setProductName] = useState("");
  const [notes, setNotes] = useState("");

  const showFamacha = eventType === "famacha" || eventType === "deworming";
  const showProduct = eventType === "cdt_shot" || eventType === "copper_bolus" || eventType === "deworming" || eventType === "other";
  const showDosage = showProduct;
  const scoreNum = famachaScore ? Number(famachaScore) : null;
  const needsDeworming = eventType === "famacha" && scoreNum != null && scoreNum >= famachaThreshold;

  const reset = () => {
    setEventType("hoof_trim");
    setEventDate(todayInputValue());
    setFamachaScore("");
    setDosageMl("");
    setBodyWeight("");
    setProductName("");
    setNotes("");
  };

  const submit = () => {
    if (!eventDate) {
      toast({ title: "Pick a date", description: "The event date is required.", variant: "destructive" });
      return;
    }
    createEvent.mutate(
      {
        id: goatId,
        data: {
          eventType,
          eventDate: dateInputToIso(eventDate),
          ...(showFamacha && scoreNum ? { famachaScore: scoreNum } : {}),
          ...(showDosage && dosageMl ? { dosageMl: Number(dosageMl) } : {}),
          ...(bodyWeight ? { bodyWeight: Number(bodyWeight) } : {}),
          ...(showProduct && productName.trim() ? { productName: productName.trim() } : {}),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListGoatHealthEventsQueryKey(goatId) });
          toast({
            title: "Health event recorded",
            description: `${healthEventTypeConfig[eventType].label} logged for ${goatName}.`,
          });
          reset();
          onOpenChange(false);
        },
        onError: () =>
          toast({
            title: "Could not record event",
            description: "The health event could not be saved. Please try again.",
            variant: "destructive",
          }),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif">Add Health Event</DialogTitle>
          <DialogDescription>
            Record something you observed or treated for {goatName}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Event type</Label>
              <Select value={eventType} onValueChange={(v) => setEventType(v as HealthEventEventType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {HEALTH_EVENT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="he-date">Date</Label>
              <Input id="he-date" type="date" value={eventDate} max={todayInputValue()} onChange={(e) => setEventDate(e.target.value)} />
            </div>
          </div>

          {showFamacha && (
            <div className="space-y-1.5">
              <Label>FAMACHA score {eventType === "deworming" ? "(optional)" : ""}</Label>
              <Select value={famachaScore} onValueChange={setFamachaScore}>
                <SelectTrigger><SelectValue placeholder="Select score (1 = healthy, 5 = anemic)" /></SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5].map((s) => (
                    <SelectItem key={s} value={String(s)}>
                      {s} — {s === 1 ? "Red (optimal)" : s === 2 ? "Red-pink" : s === 3 ? "Pink" : s === 4 ? "Pink-white" : "White (severe)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {needsDeworming && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-3 text-sm text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>
                    Score {scoreNum} is at or above your farm's deworming threshold ({famachaThreshold}+).
                    Consider deworming this goat and logging it as a separate Deworming event.
                  </span>
                </div>
              )}
            </div>
          )}

          {showProduct && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="he-product">Product (optional)</Label>
                <Input id="he-product" placeholder="e.g. Cydectin" value={productName} onChange={(e) => setProductName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="he-dosage">Dose in mL (optional)</Label>
                <Input id="he-dosage" type="number" min={0} step="0.1" value={dosageMl} onChange={(e) => setDosageMl(e.target.value)} />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="he-weight">Body weight in {weightUnitLabel(weightUnit)} (optional)</Label>
            <Input id="he-weight" type="number" min={0} step="0.1" value={bodyWeight} onChange={(e) => setBodyWeight(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="he-notes">Notes (optional)</Label>
            <Textarea id="he-notes" rows={2} placeholder="What did you observe? What was done?" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={createEvent.isPending}>
            {createEvent.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Event
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EventRow({ event, goatId, weightUnit }: { event: HealthEvent; goatId: number; weightUnit: "kg" | "lb" }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isManager = useIsManager();
  const deleteEvent = useDeleteGoatHealthEvent();
  const config = healthEventTypeConfig[event.eventType];
  const Icon = config?.icon ?? HeartPulse;

  const details: string[] = [];
  if (event.famachaScore != null) details.push(`FAMACHA ${event.famachaScore}`);
  if (event.productName) details.push(event.productName);
  if (event.dosageMl != null) details.push(`${event.dosageMl} mL`);
  if (event.bodyWeight != null) details.push(`${event.bodyWeight} ${weightUnitLabel(weightUnit)}`);

  const remove = () => {
    deleteEvent.mutate(
      { id: goatId, eventId: event.id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListGoatHealthEventsQueryKey(goatId) });
          toast({ title: "Health event deleted", description: "The record was removed." });
        },
        onError: () =>
          toast({ title: "Could not delete", description: "The record could not be removed.", variant: "destructive" }),
      },
    );
  };

  return (
    <div className="flex items-start gap-3 rounded-xl border border-border bg-card/50 p-4 group">
      <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-foreground text-sm">{config?.label ?? event.eventType}</span>
          <span className="text-xs text-muted-foreground">
            {formatDate(new Date(event.eventDate), { month: "short", day: "numeric", year: "numeric" })}
          </span>
        </div>
        {details.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {details.map((d) => (
              <Badge key={d} variant="outline" className="text-xs font-normal">{d}</Badge>
            ))}
          </div>
        )}
        {event.notes && <p className="text-sm text-muted-foreground mt-1.5">{event.notes}</p>}
      </div>
      {isManager && (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground/50 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
          onClick={remove}
          disabled={deleteEvent.isPending}
          aria-label="Delete health event"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

/** The Health History card on the goat detail page. */
export function HealthHistoryCard({ goatId, goatName }: { goatId: number; goatName: string }) {
  const { weightUnit } = useFarmSettings();
  const { data: events, isLoading } = useListGoatHealthEvents(goatId, {
    query: { queryKey: getListGoatHealthEventsQueryKey(goatId) },
  });
  const [addOpen, setAddOpen] = useState(false);

  const sorted = useMemo(() => events ?? [], [events]);

  return (
    <Card className="border-primary/10 shadow-md">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="font-serif text-lg flex items-center gap-2">
          <HeartPulse className="h-4 w-4 text-primary" /> Health History
        </CardTitle>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Add Event
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : sorted.length > 0 ? (
          sorted.map((event) => (
            <EventRow key={event.id} event={event} goatId={goatId} weightUnit={weightUnit} />
          ))
        ) : (
          <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
            <Footprints className="h-8 w-8 text-muted-foreground/30 mb-3" />
            <p className="italic text-sm">No health events recorded yet.</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Log hoof trims, CD&T shots, FAMACHA scores, dewormings, and more.
            </p>
          </div>
        )}
      </CardContent>
      <AddHealthEventDialog goatId={goatId} goatName={goatName} open={addOpen} onOpenChange={setAddOpen} />
    </Card>
  );
}
