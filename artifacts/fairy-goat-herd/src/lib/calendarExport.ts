/**
 * Pure helpers for exporting a single calendar event to external calendar apps.
 *
 * Every event is treated as an all-day event anchored on its `startDate` (the
 * expected kidding date). Google Calendar and Outlook Web are URL-based "add
 * event" deep links opened in a new tab — there is no OAuth or sync. The `.ics`
 * download is a universal fallback that desktop Outlook and Apple Calendar can
 * import.
 */

export interface CalendarEvent {
  /** Event title, e.g. "Kidding due: Daisy". */
  title: string;
  /** The day the (all-day) event falls on. Only the local date is used. */
  startDate: Date;
  /** Free-text details shown in the event body. */
  description?: string;
}

/** Formats a date as `YYYYMMDD` using its local calendar day. */
function toBasicDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

/** Returns a new date one calendar day after the given one. */
function nextDay(date: Date): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + 1);
  return next;
}

/**
 * Builds a Google Calendar "create event" URL prefilled with an all-day event.
 * The `dates` range uses an exclusive end date (start + 1 day), as Google
 * expects for all-day events.
 */
export function toGoogleCalendarUrl(event: CalendarEvent): string {
  const start = toBasicDate(event.startDate);
  const end = toBasicDate(nextDay(event.startDate));
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${start}/${end}`,
  });
  if (event.description) params.set("details", event.description);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * Builds an Outlook Web "compose event" deep link prefilled with an all-day
 * event. Outlook expects ISO date strings for `startdt`/`enddt`.
 */
export function toOutlookWebUrl(event: CalendarEvent): string {
  const startIso = `${event.startDate.getFullYear()}-${String(
    event.startDate.getMonth() + 1,
  ).padStart(2, "0")}-${String(event.startDate.getDate()).padStart(2, "0")}`;
  const end = nextDay(event.startDate);
  const endIso = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(
    2,
    "0",
  )}-${String(end.getDate()).padStart(2, "0")}`;
  const params = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: event.title,
    startdt: startIso,
    enddt: endIso,
    allday: "true",
  });
  if (event.description) params.set("body", event.description);
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
}

/** Escapes a value for inclusion in an ICS text field per RFC 5545. */
function escapeIcs(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Builds the raw text of a single-event ICS calendar. */
export function buildIcs(event: CalendarEvent): string {
  const start = toBasicDate(event.startDate);
  const end = toBasicDate(nextDay(event.startDate));
  const stamp = `${toBasicDate(new Date())}T000000Z`;
  const uid = `${start}-${Math.random().toString(36).slice(2)}@mygoatherd`;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//MyGoatHerd//Breeding Calendar//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${start}`,
    `DTEND;VALUE=DATE:${end}`,
    `SUMMARY:${escapeIcs(event.title)}`,
  ];
  if (event.description) lines.push(`DESCRIPTION:${escapeIcs(event.description)}`);
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.join("\r\n");
}

/** Triggers a browser download of an `.ics` file for the given event. */
export function downloadIcs(event: CalendarEvent, fileName = "kidding.ics"): void {
  const blob = new Blob([buildIcs(event)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName.endsWith(".ics") ? fileName : `${fileName}.ics`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
