import type { DashboardWidget } from "@workspace/api-client-react";

/** A dashboard widget id known to the frontend registry. */
export type DashboardWidgetId =
  | "total-goats"
  | "health-status"
  | "milking-status"
  | "does-breakdown"
  | "recent-activity";

export interface DashboardWidgetDef {
  id: DashboardWidgetId;
  /** Human-readable name shown in the Customize panel. */
  label: string;
  /** Short helper text describing what the widget shows. */
  description: string;
}

/**
 * The canonical widget catalog in default display order. This is the fallback
 * layout (all widgets visible, in this order) when no saved layout exists, and
 * the source of labels for the Customize panel. The server keeps a matching id
 * list for normalization.
 */
export const DASHBOARD_WIDGETS: DashboardWidgetDef[] = [
  { id: "total-goats", label: "Total Goats", description: "Herd totals split by does, bucks, and wethers." },
  { id: "health-status", label: "Healthy", description: "Count of goats with no current health concerns." },
  { id: "milking-status", label: "Milking", description: "Count of does currently in milk." },
  { id: "does-breakdown", label: "Does Breakdown", description: "Lactation status breakdown chart for does." },
  { id: "recent-activity", label: "Recent Herd Updates", description: "Recently updated goats in your herd." },
];

/** The default layout: every widget visible, in canonical order. */
export function defaultDashboardLayout(): DashboardWidget[] {
  return DASHBOARD_WIDGETS.map((w) => ({ id: w.id, visible: true }));
}

const WIDGET_BY_ID = new Map(DASHBOARD_WIDGETS.map((w) => [w.id, w]));

export function getWidgetDef(id: string): DashboardWidgetDef | undefined {
  return WIDGET_BY_ID.get(id as DashboardWidgetId);
}

/**
 * Reconciles a (possibly stale/partial) saved layout against the current
 * catalog: drops unknown ids, preserves saved order + visibility, and appends
 * any catalog widgets missing from the saved layout (visible). Mirrors the
 * server-side normalization so the UI is stable even before a save round-trips.
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
    result.push({ id: entry.id, visible: entry.visible !== false });
  }

  for (const w of DASHBOARD_WIDGETS) {
    if (!seen.has(w.id)) result.push({ id: w.id, visible: true });
  }

  return result;
}
