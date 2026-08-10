import { Feather } from "@expo/vector-icons";
import type {
  DueHealthItem,
  HealthEventEventType,
} from "@workspace/api-client-react/src/generated/api.schemas";

export type FeatherIconName = keyof typeof Feather.glyphMap;

/** The health tasks a farmer can record on a work day, in wizard order. */
export const HEALTH_EVENT_TYPES: {
  value: HealthEventEventType;
  label: string;
  icon: FeatherIconName;
}[] = [
  { value: "hoof_trim", label: "Hoof trim", icon: "scissors" },
  { value: "cdt_shot", label: "CD&T shot", icon: "shield" },
  { value: "copper_bolus", label: "Copper bolus", icon: "droplet" },
  { value: "famacha", label: "FAMACHA check", icon: "eye" },
  { value: "deworming", label: "Deworming", icon: "activity" },
  { value: "other", label: "Other", icon: "plus-circle" },
];

/** Event types that carry an optional product name + dose. */
export const DOSAGE_TYPES: HealthEventEventType[] = [
  "cdt_shot",
  "copper_bolus",
  "deworming",
  "other",
];

/** Short labels for schedulable task types shown on due badges. */
export const SCHEDULE_TYPE_LABELS: Record<string, string> = {
  hoof_trim: "Hoof trim",
  cdt_shot: "CD&T",
  copper_bolus: "Copper bolus",
  deworming: "Deworming",
  cidr: "CIDR removal",
};

export function eventTypeLabel(t: HealthEventEventType): string {
  return HEALTH_EVENT_TYPES.find((x) => x.value === t)?.label ?? t;
}

/** A compact human phrase for how overdue (or how new) a due item is. */
export function dueItemLabel(item: DueHealthItem): string {
  const name = SCHEDULE_TYPE_LABELS[item.eventType] ?? item.eventType;
  if (item.status === "never") return `${name} · never done`;
  if (item.status === "overdue") {
    const d = item.daysOverdue;
    return `${name} · ${d === 0 ? "due today" : `${d} day${d === 1 ? "" : "s"} overdue`}`;
  }
  return `${name} · due soon`;
}

/** True when a due item needs action now (overdue or never done). */
export function isActionable(item: DueHealthItem): boolean {
  return item.status === "overdue" || item.status === "never";
}

/**
 * True when a due item can be handled as a herd work-day task. CIDR removals
 * are reminder-only: they stay visible as badges, but never count toward the
 * "start a work day" summary or preselection, because the bulk endpoint does
 * not accept CIDR and removal is a per-doe action.
 */
export function isWorkDayActionable(item: DueHealthItem): boolean {
  return isActionable(item) && item.eventType !== "cidr";
}

/** The FAMACHA threshold at/above which deworming is suggested (farm default). */
export const DEFAULT_FAMACHA_THRESHOLD = 3;

// --- Goat display helpers -------------------------------------------------

const BREED_LABELS: Record<string, string> = {
  alpine: "Alpine",
  angora: "Angora",
  boer: "Boer",
  guernsey: "Guernsey",
  kiko: "Kiko",
  lamancha: "LaMancha",
  mixed: "Mixed",
  myotonic: "Myotonic",
  "nigerian-dwarf": "Nigerian Dwarf",
  nubian: "Nubian",
  oberhasli: "Oberhasli",
  pygmy: "Pygmy",
  "recorded-grade": "Recorded Grade",
  saanen: "Saanen",
  sable: "Sable",
  savanna: "Savanna",
  spanish: "Spanish",
  texmaster: "Texmaster",
  toggenburg: "Toggenburg",
};

export function breedLabel(slug: string | null | undefined): string {
  if (!slug) return "";
  return BREED_LABELS[slug] ?? slug;
}

export function sexLabel(sex: string | null | undefined): string {
  if (sex === "doe") return "Doe";
  if (sex === "buck") return "Buck";
  if (sex === "wether") return "Wether";
  return "";
}

// --- Date helpers ---------------------------------------------------------

export function todayInputValue(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Convert a `YYYY-MM-DD` value to a full ISO datetime (noon, to avoid TZ drift). */
export function dateInputToIso(value: string): string {
  return new Date(`${value}T12:00:00`).toISOString();
}

/** Format a full ISO timestamp as a short human date (e.g. "Jun 4, 2026"). */
export function formatIsoDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatLongDate(value: string): string {
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}
