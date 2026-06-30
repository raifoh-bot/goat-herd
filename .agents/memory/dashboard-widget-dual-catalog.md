---
name: Dashboard widget dual catalog
description: Two parallel widget catalogs (frontend + server) must stay in sync; opt-in widgets append hidden.
---

# Dashboard widget registries live in two places

Adding/removing a dashboard widget requires editing BOTH:
- frontend catalog (`fairy-goat-herd/src/lib/dashboard-widgets.ts`) — labels, order, `defaultVisible`, plus the `WIDE_WIDGETS` set and a `renderWidget` case in `dashboard.tsx`.
- server catalog (`api-server/src/lib/dashboardWidgets.ts`) — `DEFAULT_DASHBOARD_WIDGET_IDS` + the default-hidden set.

**Why:** both `resolveDashboardLayout` (frontend) and `normalizeDashboardLayout` (server) reconcile saved layouts against their own catalog: ids not in the catalog are *stripped*, and catalog ids missing from a saved layout are *appended*. If the two lists drift, a widget can be stripped on save (server) yet rendered (frontend), or vice-versa.

**How to apply:**
- Opt-in / default-hidden widgets must be appended with `visible:false` in BOTH normalizers (frontend uses `defaultVisible !== false`; server uses a `DEFAULT_HIDDEN_WIDGET_IDS` set). Otherwise an existing farm's saved layout gets the new widget appended as visible.
- `settings.test.ts` asserts the *exact* normalized layout array (full catalog order + visibility). Any catalog change breaks those 3 dashboard-layout assertions — update them in lockstep. (As of this work they had pre-existing drift: tests listed 5 widgets while the catalog had 8.)
