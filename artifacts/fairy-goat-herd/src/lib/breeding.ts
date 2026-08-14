import { type BreedingWithDoe } from "@workspace/api-client-react";

/** Herd-status values that mean the doe has left the farm. */
const DEPARTED_STATUSES = new Set([
  "sold-registered",
  "sold-not-registered",
  "dead",
]);

/**
 * Returns `true` when the doe on a breeding has left the herd (sold or dead).
 * A missing or null herd status is treated as "still on farm" so that does
 * without an explicit status continue to appear in the kidding widgets.
 */
export function doeLeftHerd(b: Pick<BreedingWithDoe, "doe">): boolean {
  const status = b.doe?.herdStatus ?? null;
  return status !== null && DEPARTED_STATUSES.has(status);
}

/**
 * Parses a breeding date string into a local-midnight `Date`, or null when the
 * value is missing/unparseable.
 *
 * Date-only strings (`YYYY-MM-DD`) must be anchored to local time, not UTC, so
 * the calendar day doesn't shift across time zones. Full timestamps are read as
 * given and then normalized to their local calendar day.
 */
export function parseDueDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const parsed = dateOnly ? new Date(`${value}T00:00:00`) : new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

/**
 * The calendar day a kidding should be plotted on: the recorded expected
 * kidding date when present, otherwise a fallback of the breeding date plus the
 * farm's gestation length. Without this fallback, breedings saved with no
 * expected kidding date never appear on the dashboard.
 *
 * Both the recorded and fallback paths use calendar-day arithmetic so the two
 * dashboard widgets (Breeding Calendar and Upcoming Kiddings) always agree on
 * the day, free of DST/timezone drift.
 */
export function getEffectiveDueDate(
  b: Pick<BreedingWithDoe, "expectedKiddingDate" | "breedingDate">,
  gestationDays: number,
): Date | null {
  const recorded = parseDueDate(b.expectedKiddingDate);
  if (recorded) return recorded;
  const bred = parseDueDate(b.breedingDate);
  if (!bred) return null;
  return new Date(bred.getFullYear(), bred.getMonth(), bred.getDate() + gestationDays);
}
