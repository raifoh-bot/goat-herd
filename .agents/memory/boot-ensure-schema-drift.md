---
name: Boot-ensure DDL must mirror the Drizzle schema
description: Why GET /api/settings (and similar) 500 on legacy tables, and the rule to prevent it
---

When a column is added to a Drizzle table schema, the boot-time `ensure*` DDL
helpers (e.g. `ensureFarmSettings`, `ensureGoatColumns` in
`artifacts/api-server/src/lib/`) MUST gain a matching
`ALTER TABLE ... ADD COLUMN IF NOT EXISTS` for it.

**Why:** This repo provisions/repairs schema two ways — (1) boot-time idempotent
DDL, and (2) Replit's publish-time dev→prod schema diff. The publish diff
compares against the *dev* DB, and the dev DB itself is built by the same
boot-ensure DDL. So if the boot-ensure list omits a column, dev never gets it,
the publish diff sees nothing to add, and prod never gets it either — yet
`db.select()` emits `SELECT <all schema columns>`, which then fails with a
column-does-not-exist 500 on every read. This is exactly how breed selection
broke: `farm_settings` was missing `adga_number` and `logo_url`, so
`GET /api/settings` 500'd in both dev and prod, starving the breed dropdown
(which reads `enabledBreeds` from settings).

**How to apply:** Treat the boot-ensure column list as the source of truth that
must stay in lockstep with each Drizzle table. After adding/altering a column in
`lib/db/src/schema/*`, update the corresponding `ensure*` helper in the same
change. Prod is read-only via tooling, so the only way prod heals is a republish
that runs the updated boot ensure.

**Tests don't run the boot ensure.** The vitest suites `import app` directly and
never call `provision()`, so a newly added column will NOT exist in the dev DB
when tests run — every `db.select()` on that table 500s and unrelated suites
(e.g. superadmin farm creation, which inserts a settings row) fail with it. Fix:
after adding the column + ensure helper, apply it to the dev DB once manually
(`executeSql` `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...`) before running
tests. Do NOT use drizzle `push` (it drops `user_sessions`).
