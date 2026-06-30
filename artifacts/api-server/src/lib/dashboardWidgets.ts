import type { DashboardWidgetLayout } from "@workspace/db";

/**
 * The canonical dashboard widget ids in their default display order. The
 * frontend keeps its own copy with display labels; this server-side list is the
 * source of truth for normalizing a persisted layout so unknown widgets are
 * stripped and newly-added widgets are never silently hidden for existing farms.
 */
export const DEFAULT_DASHBOARD_WIDGET_IDS = [
  "total-goats",
  "health-status",
  "milking-status",
  "avg-milk",
  "does-breakdown",
  "upcoming-kiddings",
  "breed-breakdown",
  "recent-activity",
  "breeding-calendar",
] as const;

/**
 * Widgets that are opt-in: they belong to the catalog (so they aren't stripped)
 * but stay hidden when appended to a layout that predates them. Mirrors the
 * frontend's `defaultVisible: false` flag.
 */
const DEFAULT_HIDDEN_WIDGET_IDS = new Set<string>(["breeding-calendar"]);

/**
 * Reconciles a (possibly stale or partial) persisted layout against the current
 * widget catalog:
 *  - drops ids that are no longer known widgets,
 *  - keeps the saved order and visibility for known ids,
 *  - appends any catalog widgets missing from the saved layout (visible), so a
 *    farm that saved a layout before a new widget shipped still sees it.
 *
 * Passing `null`/`undefined` yields the full default layout (all visible).
 */
export function normalizeDashboardLayout(
  saved: DashboardWidgetLayout[] | null | undefined,
): DashboardWidgetLayout[] {
  const known = new Set<string>(DEFAULT_DASHBOARD_WIDGET_IDS);
  const seen = new Set<string>();
  const result: DashboardWidgetLayout[] = [];

  for (const entry of saved ?? []) {
    if (!entry || typeof entry.id !== "string") continue;
    if (!known.has(entry.id) || seen.has(entry.id)) continue;
    seen.add(entry.id);
    result.push({ id: entry.id, visible: entry.visible !== false });
  }

  for (const id of DEFAULT_DASHBOARD_WIDGET_IDS) {
    if (!seen.has(id)) result.push({ id, visible: !DEFAULT_HIDDEN_WIDGET_IDS.has(id) });
  }

  return result;
}

/**
 * Normalizes a per-user personal dashboard layout. Unlike the farm-wide
 * variant, a `null`/`undefined` input is preserved as `null` (meaning "this
 * user has no personal override; fall back to the farm default"). A non-null
 * array is reconciled against the catalog exactly like the farm layout so
 * unknown ids are dropped and newly-shipped widgets are appended (visible).
 */
export function normalizePersonalDashboardLayout(
  saved: DashboardWidgetLayout[] | null | undefined,
): DashboardWidgetLayout[] | null {
  if (saved == null) return null;
  return normalizeDashboardLayout(saved);
}
