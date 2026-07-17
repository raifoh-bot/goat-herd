---
name: Multi-tenant login requires a farm slug
description: Why login returns 401 in the dev preview after the multi-tenant merge, and the fix.
---

After the subdomain-per-farm tenancy change, `POST /api/auth/login` is scoped to a farm. With no resolved tenant, only platform `superadmin` accounts (farm_id NULL) may authenticate — every other user gets 401 "Invalid username or password".

**Symptom:** dev preview login returns 401 (NOT 500 — the DB is fine and the user row exists). The boot-seeded admin (`ADMIN_USERNAME`/`ADMIN_PASSWORD`) lands in the `default` farm, so signing in with a blank Farm field fails.

**Fix (no code change):** in the login form's **Farm** field enter `default` (the seeded admin's farm slug). Tenant resolution in dev uses, in order: subdomain (prod only, gated by `FARM_BASE_DOMAIN`), the `X-Farm-Slug` header, then `session.farmSlug`. The frontend persists the chosen slug in localStorage (`mygoatherd.farmSlug`) and replays it via `X-Farm-Slug`, so after one successful login the slug is remembered on that browser.

**Verify:** `curl -X POST localhost:80/api/auth/login -H 'X-Farm-Slug: default' -d '{"username":"Admin","password":"…"}'` → 200; same without the header → 401.

**Why:** prevents re-diagnosing "preview login broken" as a DB/table problem when it is just a missing farm slug post-tenancy.

## Production has the same trap (no subdomains configured)

`FARM_BASE_DOMAIN` is NOT set in any environment, so prod has no per-farm subdomain resolution either — production login also depends entirely on the user typing their exact farm slug into the login **Farm** field (it rides as `X-Farm-Slug`). Blank or display-name-instead-of-slug → 401 "Invalid username or password" (NOT 404; a non-existent slug is what returns 404). This is real-user-facing fragility, not just a dev-preview quirk.

**A "no one can log in to production" report was a stale cached frontend bundle** — the published static app served an old build that didn't attach the farm header; a hard browser refresh loaded the current build and logins worked again. Check for a stale bundle / hard-refresh before assuming a backend regression.

## Superadmin was locked out by a stale farm context (fixed July 2026)

The login page pre-fills the Farm field from localStorage, so after visiting any farm the superadmin's login rode in with an `X-Farm-Slug` header → farm-scoped lookup → 401, even with correct credentials. **Fix (in code now):** `POST /api/auth/login` falls back to the global superadmin account (`farm_id IS NULL`) when the farm-scoped lookup finds no user, and clears the tenant on the session. Regression test lives in the auth route tests. Lesson: any farm-context source (header, session, stored slug) must never be able to lock out the no-farm superadmin.

**Robust fix (not yet built, user-approved direction pending):** make the Farm field optional and resolve the tenant from credentials at login — find users by username across active farms (+ superadmin), bcrypt-compare, log in the single match; if a username collides across farms (e.g. `admin` exists in multiple), return a disambiguation response. Removes the slug-required trap entirely.
