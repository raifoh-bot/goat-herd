import type { DashboardWidget } from "@workspace/api-client-react";

/** A dashboard widget id known to the frontend registry. */
export type DashboardWidgetId =
  | "total-goats"
  | "health-status"
  | "milking-status"
  | "avg-milk"
  | "does-breakdown"
  | "upcoming-kiddings"
  | "breed-breakdown"
  | "recent-activity"
  | "breeding-calendar"
  | "health-due";

/** A widget's default placement + minimum size on the 12-column snap grid. */
export interface GridItem {
  x: number;
  y: number;
  w: number;
  h: number;
  minW: number;
  minH: number;
}

export interface DashboardWidgetDef {
  id: DashboardWidgetId;
  /** Human-readable name shown in the Customize panel. */
  label: string;
  /** Short helper text describing what the widget shows. */
  description: string;
  /**
   * Whether the widget is shown by default (when no saved layout exists, and
   * when appended to an existing layout). Opt-in widgets set this to `false` so
   * they appear in the Customize panel but stay hidden until explicitly enabled.
   * Defaults to `true` when omitted.
   */
  defaultVisible?: boolean;
  /**
   * Default position + size on the 12-column grid, plus the minimum size the
   * user can resize the widget down to (so it never collapses to illegible).
   */
  defaultGridItem: GridItem;
  /**
   * Default position + size on the intermediate 6-column ("md") tablet grid.
   * This layout is never persisted (drag/resize only applies to the 12-column
   * desktop grid); it just gives tablet-width screens a balanced multi-column
   * arrangement instead of one tall stack.
   */
  defaultGridItemMd: GridItem;
}

/**
 * The canonical widget catalog in default display order. This is the fallback
 * layout (all widgets visible, in this order) when no saved layout exists, and
 * the source of labels for the Customize panel. The server keeps a matching id
 * list for normalization.
 *
 * Grid coordinates lay the widgets out on a 12-column grid: the four stat cards
 * fill the top row (w:3 each), and the wider chart/list widgets sit below in
 * two columns (w:6 each).
 */
export const DASHBOARD_WIDGETS: DashboardWidgetDef[] = [
  {
    id: "total-goats",
    label: "Total Goats",
    description: "Herd totals split by does, bucks, and wethers.",
    defaultGridItem: { x: 0, y: 0, w: 3, h: 3, minW: 2, minH: 2 },
    defaultGridItemMd: { x: 0, y: 0, w: 3, h: 3, minW: 2, minH: 2 },
  },
  {
    id: "health-status",
    label: "Healthy",
    description: "Count of goats with no current health concerns.",
    defaultGridItem: { x: 3, y: 0, w: 3, h: 3, minW: 2, minH: 2 },
    defaultGridItemMd: { x: 3, y: 0, w: 3, h: 3, minW: 2, minH: 2 },
  },
  {
    id: "milking-status",
    label: "Milking",
    description: "Count of does currently in milk.",
    defaultGridItem: { x: 6, y: 0, w: 3, h: 3, minW: 2, minH: 2 },
    defaultGridItemMd: { x: 0, y: 3, w: 3, h: 3, minW: 2, minH: 2 },
  },
  {
    id: "avg-milk",
    label: "Average Milk/Day",
    description: "Average daily milk production across the herd.",
    defaultGridItem: { x: 9, y: 0, w: 3, h: 3, minW: 2, minH: 2 },
    defaultGridItemMd: { x: 3, y: 3, w: 3, h: 3, minW: 2, minH: 2 },
  },
  {
    id: "does-breakdown",
    label: "Does Breakdown",
    description: "Lactation status breakdown chart for does.",
    defaultGridItem: { x: 0, y: 3, w: 6, h: 6, minW: 3, minH: 4 },
    defaultGridItemMd: { x: 0, y: 6, w: 3, h: 6, minW: 3, minH: 4 },
  },
  {
    id: "upcoming-kiddings",
    label: "Upcoming Kiddings",
    description: "Does due to kid soon, sorted by date.",
    defaultGridItem: { x: 6, y: 3, w: 6, h: 6, minW: 3, minH: 3 },
    defaultGridItemMd: { x: 3, y: 6, w: 3, h: 6, minW: 3, minH: 3 },
  },
  {
    id: "breed-breakdown",
    label: "Breed Breakdown",
    description: "Goat counts grouped by breed.",
    defaultGridItem: { x: 0, y: 9, w: 6, h: 6, minW: 3, minH: 3 },
    defaultGridItemMd: { x: 0, y: 12, w: 3, h: 6, minW: 3, minH: 3 },
  },
  {
    id: "recent-activity",
    label: "Recent Herd Updates",
    description: "Recently updated goats in your herd.",
    defaultGridItem: { x: 6, y: 9, w: 6, h: 6, minW: 3, minH: 3 },
    defaultGridItemMd: { x: 3, y: 12, w: 3, h: 6, minW: 3, minH: 3 },
  },
  {
    id: "breeding-calendar",
    label: "Breeding Calendar",
    description: "Month-grid calendar of expected kidding dates with Google, Outlook, and .ics export.",
    defaultGridItem: { x: 0, y: 15, w: 6, h: 7, minW: 4, minH: 5 },
    defaultGridItemMd: { x: 0, y: 18, w: 6, h: 7, minW: 4, minH: 5 },
  },
  {
    id: "health-due",
    label: "Health Work Due",
    description: "Goats overdue or coming due for routine health work, based on your schedule.",
    defaultGridItem: { x: 6, y: 15, w: 6, h: 5, minW: 3, minH: 3 },
    defaultGridItemMd: { x: 0, y: 25, w: 3, h: 5, minW: 3, minH: 3 },
  },
];

/**
 * The default layout in canonical order. Widgets are visible by default unless
 * they opt out via `defaultVisible: false`, and each carries its default grid
 * placement.
 */
export function defaultDashboardLayout(): DashboardWidget[] {
  return DASHBOARD_WIDGETS.map((w) => ({
    id: w.id,
    visible: w.defaultVisible !== false,
    x: w.defaultGridItem.x,
    y: w.defaultGridItem.y,
    w: w.defaultGridItem.w,
    h: w.defaultGridItem.h,
  }));
}

const WIDGET_BY_ID = new Map(DASHBOARD_WIDGETS.map((w) => [w.id, w]));

export function getWidgetDef(id: string): DashboardWidgetDef | undefined {
  return WIDGET_BY_ID.get(id as DashboardWidgetId);
}

/** Returns the default grid placement + minimum size for a widget id. */
export function getWidgetGridItem(id: string): GridItem | undefined {
  return WIDGET_BY_ID.get(id as DashboardWidgetId)?.defaultGridItem;
}

/**
 * Returns the default placement + minimum size for a widget id on the
 * intermediate 6-column ("md") tablet grid.
 */
export function getWidgetGridItemMd(id: string): GridItem | undefined {
  return WIDGET_BY_ID.get(id as DashboardWidgetId)?.defaultGridItemMd;
}

/**
 * Reconciles a (possibly stale/partial) saved layout against the current
 * catalog: drops unknown ids, preserves saved order + visibility, fills in any
 * missing grid coordinates from the widget's defaults (so old `{id, visible}`
 * layouts are forward-migrated gracefully), and appends any catalog widgets
 * missing from the saved layout (visible). Mirrors the server-side
 * normalization so the UI is stable even before a save round-trips.
 */
export function resolveDashboardLayout(
  saved: DashboardWidget[] | null | undefined,
): DashboardWidget[] {
  const seen = new Set<string>();
  const result: DashboardWidget[] = [];

  for (const entry of saved ?? []) {
    if (!entry || !WIDGET_BY_ID.has(entry.id as DashboardWidgetId)) continue;
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    const grid = getWidgetGridItem(entry.id)!;
    result.push({
      id: entry.id,
      visible: entry.visible !== false,
      x: typeof entry.x === "number" ? entry.x : grid.x,
      y: typeof entry.y === "number" ? entry.y : grid.y,
      w: typeof entry.w === "number" ? entry.w : grid.w,
      h: typeof entry.h === "number" ? entry.h : grid.h,
    });
  }

  for (const w of DASHBOARD_WIDGETS) {
    if (!seen.has(w.id)) {
      result.push({
        id: w.id,
        visible: w.defaultVisible !== false,
        x: w.defaultGridItem.x,
        y: w.defaultGridItem.y,
        w: w.defaultGridItem.w,
        h: w.defaultGridItem.h,
      });
    }
  }

  return result;
}
