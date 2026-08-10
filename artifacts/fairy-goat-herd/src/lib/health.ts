import type { HealthEventEventType } from "@workspace/api-client-react/src/generated/api.schemas";

/** Copper bolus doses are given in whole-gram boluses: 2g increments, 2–20g. */
export const COPPER_BOLUS_DOSES_G = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20];

/** The dose unit for an event type — copper boluses are grams, everything else mL. */
export function doseUnit(eventType: HealthEventEventType): "g" | "mL" {
  return eventType === "copper_bolus" ? "g" : "mL";
}

/** Whether a FAMACHA score is a valid 1–5 value. */
export function isValidFamachaScore(score: number): boolean {
  return score >= 1 && score <= 5;
}

/**
 * Whether a FAMACHA score should trigger a suggested deworming, per the
 * farm's threshold setting.
 */
export function famachaSuggestsDeworming(score: number, threshold: number): boolean {
  return isValidFamachaScore(score) && score >= threshold;
}

/** Standard CIDR protocol length in days, mirrored by the API default. */
export const DEFAULT_CIDR_TREATMENT_DAYS = 12;

/** The CIDR removal date: insertion date plus the treatment length in days. */
export function cidrRemovalDate(insertionDate: Date, treatmentDays: number): Date {
  const removal = new Date(insertionDate);
  removal.setDate(removal.getDate() + treatmentDays);
  return removal;
}
