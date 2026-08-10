import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListGoatHealthEventsQueryKey,
  useCreateGoatHealthEvent,
  useDeleteGoatHealthEvent,
  useListGoatHealthEvents,
  useUpdateGoatHealthEvent,
} from "@workspace/api-client-react";
import type {
  HealthEvent,
  HealthEventEventType,
} from "@workspace/api-client-react/src/generated/api.schemas";
import { AlertTriangle, Bug, CalendarPlus, ChevronDown, ChevronUp, Download, Droplets, Eye, Footprints, HeartPulse, Loader2, Microscope, Pencil, Plus, Scissors, Syringe, Timer, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { formatDate, todayInputValue, dateInputToIso } from "@/lib/date";
import { COPPER_BOLUS_DOSES_G, DEFAULT_CIDR_TREATMENT_DAYS, cidrRemovalDate, doseUnit, famachaSuggestsDeworming } from "@/lib/health";
import { toGoogleCalendarUrl, toOutlookWebUrl, downloadIcs, type CalendarEvent } from "@/lib/calendarExport";
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
  { value: "cidr", label: "CIDR", icon: Timer },
  { value: "parasites", label: "Parasites", icon: Microscope },
  { value: "other", label: "Other", icon: HeartPulse },
];

/** The parasite kinds a Parasites event can record, in picker order. */
export const PARASITE_TYPES: { value: "barber_pole" | "coccidia" | "other"; label: string }[] = [
  { value: "barber_pole", label: "Barber pole worm" },
  { value: "coccidia", label: "Coccidia" },
  { value: "other", label: "Other" },
];

export const parasiteTypeLabel = (value: string | null | undefined): string =>
  PARASITE_TYPES.find((p) => p.value === value)?.label ?? value ?? "";

export const healthEventTypeConfig = Object.fromEntries(
  HEALTH_EVENT_TYPES.map((t) => [t.value, t]),
) as Record<HealthEventEventType, (typeof HEALTH_EVENT_TYPES)[number]>;

/** Builds the calendar event for a CIDR removal reminder. */
function buildCidrRemovalCalendarEvent(goatName: string, removalDate: Date, coTreatments?: string | null): CalendarEvent {
  return {
    title: `CIDR removal due: ${goatName}`,
    startDate: removalDate,
    description: [
      `The CIDR inserted in ${goatName} is due for removal on this day.`,
      coTreatments ? `Co-treatments at insertion: ${coTreatments}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

/** The Google / Outlook / .ics "add removal reminder" action buttons. */
function CidrReminderButtons({ goatName, removalDate, coTreatments }: { goatName: string; removalDate: Date; coTreatments?: string | null }) {
  const event = buildCidrRemovalCalendarEvent(goatName, removalDate, coTreatments);
  const linkClass =
    "inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground hover:bg-muted transition-colors";
  return (
    <div className="flex flex-wrap gap-2">
      <a href={toGoogleCalendarUrl(event)} target="_blank" rel="noopener noreferrer" className={linkClass}>
        <CalendarPlus className="h-3.5 w-3.5" /> Google
      </a>
      <a href={toOutlookWebUrl(event)} target="_blank" rel="noopener noreferrer" className={linkClass}>
        <CalendarPlus className="h-3.5 w-3.5" /> Outlook
      </a>
      <button
        type="button"
        onClick={() => downloadIcs(event, `cidr-removal-${goatName.replace(/\s+/g, "-").toLowerCase()}.ics`)}
        className={linkClass}
      >
        <Download className="h-3.5 w-3.5" /> .ics
      </button>
    </div>
  );
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
  const [treatmentDays, setTreatmentDays] = useState(String(DEFAULT_CIDR_TREATMENT_DAYS));
  const [coTreatments, setCoTreatments] = useState("");
  const [parasiteType, setParasiteType] = useState<"barber_pole" | "coccidia" | "other" | "">("");
  const [eggCount, setEggCount] = useState("");
  const [treatmentRegimen, setTreatmentRegimen] = useState("");
  // After a CIDR event is saved, the dialog shows a reminder step with
  // add-to-calendar actions for the computed removal date.
  const [savedRemovalDate, setSavedRemovalDate] = useState<Date | null>(null);

  const showFamacha = eventType === "famacha" || eventType === "deworming";
  const showProduct = eventType === "cdt_shot" || eventType === "copper_bolus" || eventType === "deworming" || eventType === "other";
  const showDosage = showProduct;
  const showCidr = eventType === "cidr";
  const showParasites = eventType === "parasites";
  const showEggCount = showParasites && parasiteType === "barber_pole";
  const showRegimen = showParasites && (parasiteType === "coccidia" || parasiteType === "other");
  const eggCountNum = eggCount ? Number(eggCount) : null;
  const validEggCount = eggCount === "" || (Number.isInteger(eggCountNum) && (eggCountNum as number) >= 0);
  const scoreNum = famachaScore ? Number(famachaScore) : null;
  const needsDeworming = eventType === "famacha" && scoreNum != null && famachaSuggestsDeworming(scoreNum, famachaThreshold);
  const treatmentDaysNum = Number(treatmentDays);
  const validTreatmentDays = Number.isInteger(treatmentDaysNum) && treatmentDaysNum >= 1 && treatmentDaysNum <= 60;
  const removalDate =
    showCidr && eventDate && validTreatmentDays
      ? cidrRemovalDate(new Date(dateInputToIso(eventDate)), treatmentDaysNum)
      : null;
  const savedCoTreatments = coTreatments.trim() || null;

  const reset = () => {
    setEventType("hoof_trim");
    setEventDate(todayInputValue());
    setFamachaScore("");
    setDosageMl("");
    setBodyWeight("");
    setProductName("");
    setNotes("");
    setTreatmentDays(String(DEFAULT_CIDR_TREATMENT_DAYS));
    setCoTreatments("");
    setParasiteType("");
    setEggCount("");
    setTreatmentRegimen("");
    setSavedRemovalDate(null);
  };

  const submit = () => {
    if (!eventDate) {
      toast({ title: "Pick a date", description: "The event date is required.", variant: "destructive" });
      return;
    }
    if (showCidr && !validTreatmentDays) {
      toast({
        title: "Check the treatment length",
        description: "Days of treatment must be a whole number between 1 and 60.",
        variant: "destructive",
      });
      return;
    }
    if (showParasites && !parasiteType) {
      toast({
        title: "Pick a parasite",
        description: "Choose which parasite was found (barber pole, coccidia, or other).",
        variant: "destructive",
      });
      return;
    }
    if (showEggCount && !validEggCount) {
      toast({
        title: "Check the egg count",
        description: "Egg count must be a whole number of eggs per gram (0 or more).",
        variant: "destructive",
      });
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
          ...(showCidr ? { treatmentDays: treatmentDaysNum } : {}),
          ...(showCidr && coTreatments.trim() ? { coTreatments: coTreatments.trim() } : {}),
          ...(showParasites && parasiteType ? { parasiteType } : {}),
          ...(showEggCount && eggCount !== "" ? { eggCount: Number(eggCount) } : {}),
          ...(showRegimen && treatmentRegimen.trim() ? { treatmentRegimen: treatmentRegimen.trim() } : {}),
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListGoatHealthEventsQueryKey(goatId) });
          toast({
            title: "Health event recorded",
            description: `${healthEventTypeConfig[eventType].label} logged for ${goatName}.`,
          });
          if (showCidr && removalDate) {
            // Keep the dialog open on a reminder step so the removal date can
            // be added to a calendar right away.
            setSavedRemovalDate(removalDate);
            return;
          }
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

  if (savedRemovalDate) {
    return (
      <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif">CIDR recorded</DialogTitle>
            <DialogDescription>
              {goatName}'s CIDR is due for removal on{" "}
              {formatDate(savedRemovalDate, { month: "long", day: "numeric", year: "numeric" })}.
              Add a reminder to your calendar so it isn't forgotten.
            </DialogDescription>
          </DialogHeader>
          <CidrReminderButtons goatName={goatName} removalDate={savedRemovalDate} coTreatments={savedCoTreatments} />
          <DialogFooter>
            <Button onClick={() => { reset(); onOpenChange(false); }}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

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
                {eventType === "copper_bolus" ? (
                  <>
                    <Label>Dose in g (optional)</Label>
                    <Select value={dosageMl || "none"} onValueChange={(v) => setDosageMl(v === "none" ? "" : v)}>
                      <SelectTrigger aria-label="Copper bolus dose in grams"><SelectValue placeholder="Select dose" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">—</SelectItem>
                        {COPPER_BOLUS_DOSES_G.map((g) => (
                          <SelectItem key={g} value={String(g)}>{g} g</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </>
                ) : (
                  <>
                    <Label htmlFor="he-dosage">Dose in mL (optional)</Label>
                    <Input id="he-dosage" type="number" min={0} step="0.1" value={dosageMl} onChange={(e) => setDosageMl(e.target.value)} />
                  </>
                )}
              </div>
            </div>
          )}

          {showCidr && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="he-cidr-days">Days of treatment</Label>
                  <Input
                    id="he-cidr-days"
                    type="number"
                    min={1}
                    max={60}
                    step="1"
                    value={treatmentDays}
                    onChange={(e) => setTreatmentDays(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Removal date</Label>
                  <p className="text-sm font-medium text-foreground pt-2" data-testid="cidr-removal-date">
                    {removalDate
                      ? formatDate(removalDate, { month: "short", day: "numeric", year: "numeric" })
                      : "—"}
                  </p>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="he-cidr-co">Co-treatments (optional)</Label>
                <Textarea
                  id="he-cidr-co"
                  rows={2}
                  placeholder="e.g. PG600 injection, dewormer given at insertion"
                  value={coTreatments}
                  onChange={(e) => setCoTreatments(e.target.value)}
                />
              </div>
            </>
          )}

          {showParasites && (
            <>
              <div className="space-y-1.5">
                <Label>Parasite found</Label>
                <Select value={parasiteType || undefined} onValueChange={(v) => setParasiteType(v as typeof parasiteType)}>
                  <SelectTrigger aria-label="Parasite type"><SelectValue placeholder="Select parasite" /></SelectTrigger>
                  <SelectContent>
                    {PARASITE_TYPES.map((p) => (
                      <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {showEggCount && (
                <div className="space-y-1.5">
                  <Label htmlFor="he-egg-count">Egg count (eggs per gram, optional)</Label>
                  <Input
                    id="he-egg-count"
                    type="number"
                    min={0}
                    step="1"
                    placeholder="e.g. 1200"
                    value={eggCount}
                    onChange={(e) => setEggCount(e.target.value)}
                  />
                </div>
              )}
              {showRegimen && (
                <div className="space-y-1.5">
                  <Label htmlFor="he-regimen">Treatment regimen (optional)</Label>
                  <Textarea
                    id="he-regimen"
                    rows={2}
                    placeholder="e.g. Toltrazuril 1 mL/5 lb once, repeat in 10 days"
                    value={treatmentRegimen}
                    onChange={(e) => setTreatmentRegimen(e.target.value)}
                  />
                </div>
              )}
            </>
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

/** Convert an ISO timestamp to a yyyy-mm-dd date-input value (local time). */
function isoToDateInput(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

interface EditHealthEventDialogProps {
  goatId: number;
  event: HealthEvent;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Edit a previously recorded health event — fixes transcription mistakes made
 * on the goat page or when entering Barn Worksheet results. Cleared optional
 * fields are sent as null so they are actually removed from the record.
 */
export function EditHealthEventDialog({ goatId, event, open, onOpenChange }: EditHealthEventDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { weightUnit } = useFarmSettings();
  const updateEvent = useUpdateGoatHealthEvent();

  const [eventType, setEventType] = useState<HealthEventEventType>(event.eventType);
  const [eventDate, setEventDate] = useState(isoToDateInput(event.eventDate));
  const [famachaScore, setFamachaScore] = useState<string>(event.famachaScore != null ? String(event.famachaScore) : "");
  const [dosageMl, setDosageMl] = useState(event.dosageMl != null ? String(event.dosageMl) : "");
  const [bodyWeight, setBodyWeight] = useState(event.bodyWeight != null ? String(event.bodyWeight) : "");
  const [productName, setProductName] = useState(event.productName ?? "");
  const [notes, setNotes] = useState(event.notes ?? "");
  const [treatmentDays, setTreatmentDays] = useState(
    String(event.treatmentDays ?? DEFAULT_CIDR_TREATMENT_DAYS),
  );
  const [coTreatments, setCoTreatments] = useState(event.coTreatments ?? "");
  const [parasiteType, setParasiteType] = useState<"barber_pole" | "coccidia" | "other" | "">(
    (event.parasiteType as "barber_pole" | "coccidia" | "other" | null) ?? "",
  );
  const [eggCount, setEggCount] = useState(event.eggCount != null ? String(event.eggCount) : "");
  const [treatmentRegimen, setTreatmentRegimen] = useState(event.treatmentRegimen ?? "");

  // Re-prime the form whenever the dialog opens for a (possibly different) event.
  useEffect(() => {
    if (!open) return;
    setEventType(event.eventType);
    setEventDate(isoToDateInput(event.eventDate));
    setFamachaScore(event.famachaScore != null ? String(event.famachaScore) : "");
    setDosageMl(event.dosageMl != null ? String(event.dosageMl) : "");
    setBodyWeight(event.bodyWeight != null ? String(event.bodyWeight) : "");
    setProductName(event.productName ?? "");
    setNotes(event.notes ?? "");
    setTreatmentDays(String(event.treatmentDays ?? DEFAULT_CIDR_TREATMENT_DAYS));
    setCoTreatments(event.coTreatments ?? "");
    setParasiteType((event.parasiteType as "barber_pole" | "coccidia" | "other" | null) ?? "");
    setEggCount(event.eggCount != null ? String(event.eggCount) : "");
    setTreatmentRegimen(event.treatmentRegimen ?? "");
  }, [open, event]);

  const showFamacha = eventType === "famacha" || eventType === "deworming";
  const showProduct = eventType === "cdt_shot" || eventType === "copper_bolus" || eventType === "deworming" || eventType === "other";
  const showDosage = showProduct;
  const showCidr = eventType === "cidr";
  const showParasites = eventType === "parasites";
  const showEggCount = showParasites && parasiteType === "barber_pole";
  const showRegimen = showParasites && (parasiteType === "coccidia" || parasiteType === "other");
  const eggCountNum = eggCount ? Number(eggCount) : null;
  const validEggCount = eggCount === "" || (Number.isInteger(eggCountNum) && (eggCountNum as number) >= 0);
  const treatmentDaysNum = Number(treatmentDays);
  const validTreatmentDays = Number.isInteger(treatmentDaysNum) && treatmentDaysNum >= 1 && treatmentDaysNum <= 60;
  const removalDate =
    showCidr && eventDate && validTreatmentDays
      ? cidrRemovalDate(new Date(dateInputToIso(eventDate)), treatmentDaysNum)
      : null;

  const submit = () => {
    if (!eventDate) {
      toast({ title: "Pick a date", description: "The event date is required.", variant: "destructive" });
      return;
    }
    if (showCidr && !validTreatmentDays) {
      toast({
        title: "Check the treatment length",
        description: "Days of treatment must be a whole number between 1 and 60.",
        variant: "destructive",
      });
      return;
    }
    if (showParasites && !parasiteType) {
      toast({
        title: "Pick a parasite",
        description: "Choose which parasite was found (barber pole, coccidia, or other).",
        variant: "destructive",
      });
      return;
    }
    if (showEggCount && !validEggCount) {
      toast({
        title: "Check the egg count",
        description: "Egg count must be a whole number of eggs per gram (0 or more).",
        variant: "destructive",
      });
      return;
    }
    const scoreNum = famachaScore ? Number(famachaScore) : null;
    updateEvent.mutate(
      {
        id: goatId,
        eventId: event.id,
        data: {
          eventType,
          eventDate: dateInputToIso(eventDate),
          famachaScore: showFamacha && scoreNum ? scoreNum : null,
          dosageMl: showDosage && dosageMl ? Number(dosageMl) : null,
          bodyWeight: bodyWeight ? Number(bodyWeight) : null,
          productName: showProduct && productName.trim() ? productName.trim() : null,
          notes: notes.trim() ? notes.trim() : null,
          treatmentDays: showCidr ? treatmentDaysNum : null,
          coTreatments: showCidr && coTreatments.trim() ? coTreatments.trim() : null,
          parasiteType: showParasites && parasiteType ? parasiteType : null,
          eggCount: showEggCount && eggCount !== "" ? Number(eggCount) : null,
          treatmentRegimen: showRegimen && treatmentRegimen.trim() ? treatmentRegimen.trim() : null,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListGoatHealthEventsQueryKey(goatId) });
          toast({ title: "Health event updated", description: "The record was saved." });
          onOpenChange(false);
        },
        onError: () =>
          toast({
            title: "Could not save",
            description: "The health event could not be updated. Please try again.",
            variant: "destructive",
          }),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif">Edit Health Event</DialogTitle>
          <DialogDescription>
            Fix anything that was mistyped when this event was recorded.
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
              <Label htmlFor="he-edit-date">Date</Label>
              <Input id="he-edit-date" type="date" value={eventDate} max={todayInputValue()} onChange={(e) => setEventDate(e.target.value)} />
            </div>
          </div>

          {showFamacha && (
            <div className="space-y-1.5">
              <Label>FAMACHA score {eventType === "deworming" ? "(optional)" : ""}</Label>
              <Select value={famachaScore || "none"} onValueChange={(v) => setFamachaScore(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Select score (1 = healthy, 5 = anemic)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {[1, 2, 3, 4, 5].map((s) => (
                    <SelectItem key={s} value={String(s)}>
                      {s} — {s === 1 ? "Red (optimal)" : s === 2 ? "Red-pink" : s === 3 ? "Pink" : s === 4 ? "Pink-white" : "White (severe)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {showProduct && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="he-edit-product">Product (optional)</Label>
                <Input id="he-edit-product" placeholder="e.g. Cydectin" value={productName} onChange={(e) => setProductName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                {eventType === "copper_bolus" ? (
                  <>
                    <Label>Dose in g (optional)</Label>
                    <Select value={dosageMl || "none"} onValueChange={(v) => setDosageMl(v === "none" ? "" : v)}>
                      <SelectTrigger aria-label="Copper bolus dose in grams"><SelectValue placeholder="Select dose" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">—</SelectItem>
                        {COPPER_BOLUS_DOSES_G.map((g) => (
                          <SelectItem key={g} value={String(g)}>{g} g</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </>
                ) : (
                  <>
                    <Label htmlFor="he-edit-dosage">Dose in mL (optional)</Label>
                    <Input id="he-edit-dosage" type="number" min={0} step="0.1" value={dosageMl} onChange={(e) => setDosageMl(e.target.value)} />
                  </>
                )}
              </div>
            </div>
          )}

          {showCidr && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="he-edit-cidr-days">Days of treatment</Label>
                  <Input
                    id="he-edit-cidr-days"
                    type="number"
                    min={1}
                    max={60}
                    step="1"
                    value={treatmentDays}
                    onChange={(e) => setTreatmentDays(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Removal date</Label>
                  <p className="text-sm font-medium text-foreground pt-2" data-testid="cidr-edit-removal-date">
                    {removalDate
                      ? formatDate(removalDate, { month: "short", day: "numeric", year: "numeric" })
                      : "—"}
                  </p>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="he-edit-cidr-co">Co-treatments (optional)</Label>
                <Textarea
                  id="he-edit-cidr-co"
                  rows={2}
                  placeholder="e.g. PG600 injection, dewormer given at insertion"
                  value={coTreatments}
                  onChange={(e) => setCoTreatments(e.target.value)}
                />
              </div>
            </>
          )}

          {showParasites && (
            <>
              <div className="space-y-1.5">
                <Label>Parasite found</Label>
                <Select value={parasiteType || undefined} onValueChange={(v) => setParasiteType(v as typeof parasiteType)}>
                  <SelectTrigger aria-label="Parasite type"><SelectValue placeholder="Select parasite" /></SelectTrigger>
                  <SelectContent>
                    {PARASITE_TYPES.map((p) => (
                      <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {showEggCount && (
                <div className="space-y-1.5">
                  <Label htmlFor="he-edit-egg-count">Egg count (eggs per gram, optional)</Label>
                  <Input
                    id="he-edit-egg-count"
                    type="number"
                    min={0}
                    step="1"
                    placeholder="e.g. 1200"
                    value={eggCount}
                    onChange={(e) => setEggCount(e.target.value)}
                  />
                </div>
              )}
              {showRegimen && (
                <div className="space-y-1.5">
                  <Label htmlFor="he-edit-regimen">Treatment regimen (optional)</Label>
                  <Textarea
                    id="he-edit-regimen"
                    rows={2}
                    placeholder="e.g. Toltrazuril 1 mL/5 lb once, repeat in 10 days"
                    value={treatmentRegimen}
                    onChange={(e) => setTreatmentRegimen(e.target.value)}
                  />
                </div>
              )}
            </>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="he-edit-weight">Body weight in {weightUnitLabel(weightUnit)} (optional)</Label>
            <Input id="he-edit-weight" type="number" min={0} step="0.1" value={bodyWeight} onChange={(e) => setBodyWeight(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="he-edit-notes">Notes (optional)</Label>
            <Textarea id="he-edit-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={updateEvent.isPending}>
            {updateEvent.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EventRow({ event, goatId, goatName, weightUnit }: { event: HealthEvent; goatId: number; goatName: string; weightUnit: "kg" | "lb" }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isManager = useIsManager();
  const deleteEvent = useDeleteGoatHealthEvent();
  const [editOpen, setEditOpen] = useState(false);
  const config = healthEventTypeConfig[event.eventType];
  const Icon = config?.icon ?? HeartPulse;

  const isCidr = event.eventType === "cidr";
  const removalDate = isCidr
    ? cidrRemovalDate(new Date(event.eventDate), event.treatmentDays ?? DEFAULT_CIDR_TREATMENT_DAYS)
    : null;

  const details: string[] = [];
  if (event.eventType === "parasites") {
    if (event.parasiteType) details.push(parasiteTypeLabel(event.parasiteType));
    if (event.eggCount != null) details.push(`${event.eggCount} epg`);
    if (event.treatmentRegimen) details.push(`Treatment: ${event.treatmentRegimen}`);
  }
  if (event.famachaScore != null) details.push(`FAMACHA ${event.famachaScore}`);
  if (event.productName) details.push(event.productName);
  if (event.dosageMl != null) details.push(`${event.dosageMl} ${doseUnit(event.eventType)}`);
  if (event.bodyWeight != null) details.push(`${event.bodyWeight} ${weightUnitLabel(weightUnit)}`);
  if (isCidr) {
    details.push(`${event.treatmentDays ?? DEFAULT_CIDR_TREATMENT_DAYS} days`);
    if (removalDate) {
      details.push(
        `Remove ${formatDate(removalDate, { month: "short", day: "numeric", year: "numeric" })}`,
      );
    }
    if (event.coTreatments) details.push(`Co-treatments: ${event.coTreatments}`);
  }

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
    <div className="flex items-start gap-2.5 py-2 group">
      <div className="h-6 w-6 rounded-md bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
        <Icon className="h-3.5 w-3.5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-foreground text-sm">{config?.label ?? event.eventType}</span>
          {details.map((d) => (
            <Badge key={d} variant="outline" className="text-xs font-normal px-1.5 py-0">{d}</Badge>
          ))}
        </div>
        {event.notes && <p className="text-xs text-muted-foreground mt-0.5">{event.notes}</p>}
        {isCidr && removalDate && (
          <div className="mt-1.5">
            <CidrReminderButtons goatName={goatName} removalDate={removalDate} coTreatments={event.coTreatments} />
          </div>
        )}
      </div>
      <span className="text-xs text-muted-foreground whitespace-nowrap mt-1">
        {formatDate(new Date(event.eventDate), { month: "short", day: "numeric", year: "numeric" })}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 text-muted-foreground/50 hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
        onClick={() => setEditOpen(true)}
        aria-label="Edit health event"
      >
        <Pencil className="h-3.5 w-3.5" />
      </Button>
      {isManager && (
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground/50 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
          onClick={remove}
          disabled={deleteEvent.isPending}
          aria-label="Delete health event"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      )}
      <EditHealthEventDialog goatId={goatId} event={event} open={editOpen} onOpenChange={setEditOpen} />
    </div>
  );
}

const COLLAPSED_EVENT_COUNT = 4;

/** The Health History card on the goat detail page. */
export function HealthHistoryCard({ goatId, goatName }: { goatId: number; goatName: string }) {
  const { weightUnit } = useFarmSettings();
  const { data: events, isLoading } = useListGoatHealthEvents(goatId, {
    query: { queryKey: getListGoatHealthEventsQueryKey(goatId) },
  });
  const [addOpen, setAddOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setExpanded(false);
  }, [goatId]);

  const sorted = useMemo(() => events ?? [], [events]);
  const hasMore = sorted.length > COLLAPSED_EVENT_COUNT;
  const visible = expanded ? sorted : sorted.slice(0, COLLAPSED_EVENT_COUNT);

  return (
    <Card className="border-primary/10 shadow-md">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 gap-3 pb-3">
        <div className="space-y-1">
          <CardTitle className="font-serif text-lg flex items-center gap-2">
            <HeartPulse className="h-4 w-4 text-primary" /> Health History
          </CardTitle>
          <CardDescription className="text-xs">
            A running log of this goat's care — hoof trims, CD&T shots, FAMACHA scores,
            dewormings, and treatments — with dates, products, and doses.
          </CardDescription>
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)} className="shrink-0">
          <Plus className="h-4 w-4 mr-1" /> Add Event
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : sorted.length > 0 ? (
          <>
            <div className="divide-y divide-border/60">
              {visible.map((event) => (
                <EventRow key={event.id} event={event} goatId={goatId} goatName={goatName} weightUnit={weightUnit} />
              ))}
            </div>
            {hasMore && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full mt-1 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setExpanded((e) => !e)}
              >
                {expanded ? (
                  <>
                    <ChevronUp className="h-3.5 w-3.5 mr-1" /> Show less
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-3.5 w-3.5 mr-1" /> Show all {sorted.length} events
                  </>
                )}
              </Button>
            )}
          </>
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
