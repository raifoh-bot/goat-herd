---
name: Personal vs farm dashboard layout
description: How per-user dashboard layout overrides relate to the farm-wide default.
---

The dashboard layout has two tiers: a farm-wide default (farm_settings.dashboard_layout)
and an optional per-user override (users.dashboard_layout). The effective layout is
`personal ?? farm default`.

**Rule:** the personal normalizer must return `null` when input is null/undefined
(meaning "no override, follow the farm default"). Only the farm-wide normalizer
expands null into the full all-visible default layout.

**Why:** if the personal path expanded null to a full default, a user with no
override would get frozen on a snapshot of the catalog and never inherit the
admin's farm-default changes.

**How to apply:** when adding new dashboard widgets, both normalizers append the
new id (visible) to any non-null saved layout, but personal null stays null.
Personal layout writes go through PUT /api/auth/dashboard-layout and are read back
via /api/auth/me; the column is boot-ensured in ensureMultiTenant (not via push).
