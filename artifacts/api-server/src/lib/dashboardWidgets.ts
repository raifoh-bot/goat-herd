import type { DashboardWidgetLayout } from "@workspace/db";

/** A widget's default placement on the 12-column snap grid. */
type GridDefault = { x: number; y: number; w: number; h: number };

/**
 * The canonical dashboard widget ids in their default display order, each with
 * its default grid placement. The frontend keeps its own copy with display
 * labels and minimum sizes; this server-side list is the source of truth for
 * normalizing a persisted layout so unknown widgets are stripped, newly-added
 * widgets are never silently hidden for existing farms, and layouts saved
 * before drag-and-resize shipped (id + visible only) are forward-migrated with
 * default grid coordinates on the next save.
 */
const DEFAULT_DASHBOARD_WIDGETS: { id: string; grid: GridDefault }[] = [
  { id: "total-goats", grid: { x: 0, y: 0, w: 3, h: 3 } },
  { id: "health-status", grid: { x: 3, y: 0, w: 3, h: 3 } },
  { id: "milking-status", grid: { x: 6, y: 0, w: 3, h: 3 } },
  { id: "avg-milk", grid: { x: 9, y: 0, w: 3, h: 3 } },
  { id: "does-breakdown", grid: { x: 0, y: 3, w: 6, h: 6 } },
  { id: "upcoming-kiddings", grid: { x: 6, y: 3, w: 6, h: 6 } },
  { id: "breed-breakdown", grid: { x: 0, y: 9, w: 6, h: 6 } },
  { id: "recent-activity", grid: { x: 6, y: 9, w: 6, h: 6 } },
  { id: "breeding-calendar", grid: { x: 0, y: 15, w: 6, h: 7 } },
  { id: "health-due", grid: { x: 6, y: 15, w: 6, h: 5 } },
  { id: "show-time", grid: { x: 0, y: 22, w: 6, h: 4 } },
];

export const DEFAULT_DASHBOARD_WIDGET_IDS = DEFAULT_DASHBOARD_WIDGETS.map(
  (w) => w.id,
) as readonly string[];

const GRID_BY_ID = new Map(DEFAULT_DASHBOARD_WIDGETS.map((w) => [w.id, w.grid]));

/**
 * Widgets that are opt-in: they belong to the catalog (so they aren't stripped)
 * but stay hidden when appended to a layout that predates them. Mirrors the
 * frontend's `defaultVisible: false` flag.
 */
const DEFAULT_HIDDEN_WIDGET_IDS = new Set<string>(["show-time"]);

/**
 * Merges a saved entry's grid coordinates with the widget's defaults, keeping
 * any valid saved x/y/w/h and filling the rest from the catalog default.
 */
function withGrid(
  id: string,
  visible: boolean,
  saved?: Partial<DashboardWidgetLayout>,
): DashboardWidgetLayout {
  const grid = GRID_BY_ID.get(id) ?? { x: 0, y: 0, w: 3, h: 3 };
  return {
    id,
    visible,
    x: typeof saved?.x === "number" ? saved.x : grid.x,
    y: typeof saved?.y === "number" ? saved.y : grid.y,
    w: typeof saved?.w === "number" ? saved.w : grid.w,
    h: typeof saved?.h === "number" ? saved.h : grid.h,
  };
}

/**
 * Reconciles a (possibly stale or partial) persisted layout against the current
 * widget catalog:
 *  - drops ids that are no longer known widgets,
 *  - keeps the saved order and visibility for known ids,
 *  - preserves saved grid coordinates (x/y/w/h) and fills any missing ones with
 *    the widget's default placement, so pre-drag-and-resize layouts migrate,
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
    result.push(withGrid(entry.id, entry.visible !== false, entry));
  }

  for (const id of DEFAULT_DASHBOARD_WIDGET_IDS) {
    if (!seen.has(id)) result.push(withGrid(id, !DEFAULT_HIDDEN_WIDGET_IDS.has(id)));
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
