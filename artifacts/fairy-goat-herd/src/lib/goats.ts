/**
 * Shared goat display labels and eligibility rules. Every page that shows or
 * filters goats should use these so a wording or rule change cascades
 * everywhere at once.
 */

/** Herd status slugs → user-facing labels, in display order. */
export const HERD_STATUS_LABELS: Record<string, string> = {
  "on-farm": "On Farm",
  "on-farm-boarding": "On Farm - Boarding",
  leased: "Leased",
  "sold-registered": "Sold-Registered",
  "sold-not-registered": "Sold-Not Registered",
  dead: "Dead",
};

export const LACTATION_LABELS: Record<string, string> = {
  milking: "Milking",
  dry: "Dry",
  kid: "Kid",
};

export const BREEDING_LABELS: Record<string, string> = {
  exposed: "Exposed",
  serviced: "Serviced",
  pregnant: "Pregnant",
  retired: "Retired",
};

/** Plain sex label: Doe / Buck / Wether. */
export function sexLabel(sex: string | null | undefined): string {
  if (sex === "doe") return "Doe";
  if (sex === "buck") return "Buck";
  if (sex === "wether") return "Wether";
  return "—";
}

/** Sex label with symbol, honoring the leased-buck flag (herd cards/lists). */
export function sexLabelWithSymbol(goat: { sex?: string | null; leasedBuck?: boolean | null }): string {
  if (goat.sex === "doe") return "Doe ♀";
  if (goat.sex === "wether") return "Wether ⚬";
  if (goat.sex === "buck") return goat.leasedBuck ? "Leased Buck ♂" : "Buck ♂";
  return "—";
}

/**
 * The herd status a goat effectively has: goats recorded before herd status
 * existed have null and are treated as on-farm.
 */
export function effectiveHerdStatus(goat: { herdStatus?: string | null }): string {
  return goat.herdStatus ?? "on-farm";
}

/**
 * Whether a goat matches a herd-status filter (undefined filter = all).
 * The "on-farm" filter is an inclusion rule: boarding goats live on the farm
 * too, so they count as on-farm everywhere on-farm determines inclusion.
 */
export function matchesHerdStatus(
  goat: { herdStatus?: string | null },
  filter: string | undefined,
): boolean {
  if (!filter) return true;
  const status = effectiveHerdStatus(goat);
  if (filter === "on-farm") return status === "on-farm" || status === "on-farm-boarding";
  return status === filter;
}
