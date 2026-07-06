import type { BreedingWithDoe } from "@workspace/api-client-react/src/generated/api.schemas";

export interface KiddingRecord {
  timesKidded: number;
  lastKiddingDate: string | null;
  totalKids: number;
  doeKids: number;
  buckKids: number;
  doaKids: number;
}

/** Derive a doe's kidding record from the farm's breeding records. */
export function deriveKiddingRecord(goatId: number, breedings: BreedingWithDoe[]): KiddingRecord {
  const kiddings = breedings.filter((b) => b.doeId === goatId && b.status === "kidded");

  let lastKiddingDate: string | null = null;
  let doeKids = 0;
  let buckKids = 0;
  let doaKids = 0;
  for (const b of kiddings) {
    // Prefer the actual kid birth dates; fall back to the expected kidding
    // date, then the breeding date, so every kidding contributes a date.
    const candidate = kiddingDate(b);
    if (candidate && (!lastKiddingDate || candidate > lastKiddingDate)) {
      lastKiddingDate = candidate;
    }
    for (const kid of b.kids ?? []) {
      // Kid sex is only doe|buck; DOA is tracked separately in kidStatus, so a
      // DOA kid still counts toward its doe/buck total and the DOA subset.
      if (kid.sex === "doe") doeKids += 1;
      else if (kid.sex === "buck") buckKids += 1;
      if (kid.kidStatus === "doa") doaKids += 1;
    }
  }

  return {
    timesKidded: kiddings.length,
    lastKiddingDate,
    totalKids: doeKids + buckKids,
    doeKids,
    buckKids,
    doaKids,
  };
}

export interface KiddingHistoryRow {
  breedingId: number;
  date: string | null;
  sireName: string | null;
  kidsSummary: string;
}

/** One kidding's date: prefer actual kid birth dates, then expected date, then breeding date. */
function kiddingDate(b: BreedingWithDoe): string | null {
  const kidDates = (b.kids ?? [])
    .map((k) => k.birthDate)
    .filter((d): d is string => Boolean(d));
  return kidDates.sort().at(-1) ?? b.expectedKiddingDate ?? b.breedingDate ?? null;
}

/** Summarize a kidding's litter, e.g. "2 does, 1 buck (1 DOA)". */
export function summarizeKids(kids: BreedingWithDoe["kids"]): string {
  const list = kids ?? [];
  if (list.length === 0) return "Not recorded";

  const does = list.filter((k) => k.sex === "doe").length;
  const bucks = list.filter((k) => k.sex === "buck").length;
  const doa = list.filter((k) => k.kidStatus === "doa").length;

  const parts: string[] = [];
  if (does > 0) parts.push(`${does} ${does === 1 ? "doe" : "does"}`);
  if (bucks > 0) parts.push(`${bucks} ${bucks === 1 ? "buck" : "bucks"}`);

  let summary = parts.length > 0 ? parts.join(", ") : `${list.length} kids`;
  if (doa > 0) summary += ` (${doa} DOA)`;
  return summary;
}

/** Derive a doe's per-kidding history rows (newest first) from the farm's breeding records. */
export function deriveKiddingHistory(
  goatId: number,
  breedings: BreedingWithDoe[],
): KiddingHistoryRow[] {
  return breedings
    .filter((b) => b.doeId === goatId && b.status === "kidded")
    .map((b) => ({
      breedingId: b.id,
      date: kiddingDate(b),
      sireName: b.sireName || null,
      kidsSummary: summarizeKids(b.kids),
    }))
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
}

/** Max kiddings shown on the certificate so it stays on one printed page. */
export const KIDDING_HISTORY_LIMIT = 6;

export interface CappedKiddingHistory {
  visible: KiddingHistoryRow[];
  hiddenCount: number;
}

/**
 * Cap the kidding history at the most recent `limit` rows so a long-lived doe
 * can't push the certificate onto a second page. Rows are assumed newest-first.
 */
export function capKiddingHistory(
  rows: KiddingHistoryRow[],
  limit: number = KIDDING_HISTORY_LIMIT,
): CappedKiddingHistory {
  if (rows.length <= limit) return { visible: rows, hiddenCount: 0 };
  return { visible: rows.slice(0, limit), hiddenCount: rows.length - limit };
}
