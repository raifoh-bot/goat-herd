/**
 * Parse an API date string (ISO 8601) as UTC so it is never shifted by
 * the browser's local timezone offset.  Accepts a full ISO timestamp
 * ("2016-05-03T00:00:00.000Z"), a date-only string ("2016-05-03"), or a
 * Date object.  Returns null for falsy input.
 */
export function parseDate(d: string | Date | null | undefined): Date | null {
  if (!d) return null;
  if (d instanceof Date) return isNaN(d.getTime()) ? null : d;
  const date = new Date(d);
  return isNaN(date.getTime()) ? null : date;
}

/** Today's date as a yyyy-mm-dd value for HTML date inputs (local time). */
export function todayInputValue(): string {
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

/**
 * Format an API date string for display.  Always renders in UTC so the
 * displayed date matches the stored date regardless of the user's timezone.
 */
export function formatDate(
  d: string | Date | null | undefined,
  options: Intl.DateTimeFormatOptions = { month: "long", day: "numeric", year: "numeric" },
): string {
  const date = parseDate(d);
  if (!date) return "—";
  return date.toLocaleDateString("en-US", { timeZone: "UTC", ...options });
}
