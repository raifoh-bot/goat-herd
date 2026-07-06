import type { HealthScheduleIntervals, SchedulableEventType } from "@workspace/db";

// Event types a farm can put on a routine repeating schedule. FAMACHA is a
// monitoring check (already driven by its own threshold) and "other" is a
// catch-all, so neither is schedulable.
export const SCHEDULABLE_EVENT_TYPES: readonly SchedulableEventType[] = [
  "hoof_trim",
  "cdt_shot",
  "copper_bolus",
  "deworming",
];

const MAX_INTERVAL_DAYS = 3650;

/**
 * Coerces arbitrary persisted/incoming data into a clean intervals map: only
 * known schedulable keys survive, and each value must be a positive whole
 * number of days within range. Anything else is dropped so the app never has to
 * defend against a bad shape downstream.
 */
export function normalizeHealthScheduleIntervals(input: unknown): HealthScheduleIntervals {
  const out: HealthScheduleIntervals = {};
  if (!input || typeof input !== "object") return out;
  const record = input as Record<string, unknown>;
  for (const type of SCHEDULABLE_EVENT_TYPES) {
    const value = record[type];
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    const days = Math.floor(value);
    if (days >= 1 && days <= MAX_INTERVAL_DAYS) out[type] = days;
  }
  return out;
}
