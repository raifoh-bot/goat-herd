---
name: Multi-tenant login requires a farm slug
description: Why login returns 401 in the dev preview after the multi-tenant merge, and the fix.
---

After the subdomain-per-farm tenancy change, `POST /api/auth/login` is scoped to a farm. With no resolved tenant, only platform `superadmin` accounts (farm_id NULL) may authenticate — every other user gets 401 "Invalid username or password".

**Symptom:** dev preview login returns 401 (NOT 500 — the DB is fine and the user row exists). The boot-seeded admin (`ADMIN_USERNAME`/`ADMIN_PASSWORD`) lands in the `default` farm, so signing in with a blank Farm field fails.

**Fix (no code change):** in the login form's **Farm** field enter `default` (the seeded admin's farm slug). Tenant resolution in dev uses, in order: subdomain (prod only, gated by `FARM_BASE_DOMAIN`), the `X-Farm-Slug` header, then `session.farmSlug`. The frontend persists the chosen slug in localStorage (`mygoatherd.farmSlug`) and replays it via `X-Farm-Slug`, so after one successful login the slug is remembered on that browser.

**Verify:** `curl -X POST localhost:80/api/auth/login -H 'X-Farm-Slug: default' -d '{"username":"Admin","password":"…"}'` → 200; same without the header → 401.

**Why:** prevents re-diagnosing "preview login broken" as a DB/table problem when it is just a missing farm slug post-tenancy.
