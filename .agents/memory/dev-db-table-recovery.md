---
name: Dev DB loses Drizzle tables on rollback/reprovision
description: Why a DB reset breaks login, and how to recover without dropping session/settings tables.
---

Only `user_sessions` and `farm_settings` (plus a few goat ALTERs) are created by boot-time `ensure*` functions. Every other table (`users`, `goats`, `breedings`, `breeding_events`, `kids`, `semen_straws`) exists ONLY because `drizzle-kit push` was run at some point — there is no boot-time DDL and no checked-in migration for them.

**Symptom:** After a dev DB rollback or re-provision, the app boots fine but `users` is gone, so the boot admin seed throws and every `POST /api/auth/login` returns 500 `relation "users" does not exist`. The two boot-ensured tables survive (empty), which makes it look like the DB is "mostly there".

**Recovery (dev):** Apply idempotent `CREATE TABLE IF NOT EXISTS` DDL mirroring `lib/db/src/schema/*` for the missing tables (order: users, goats, semen_straws, breedings, breeding_events, kids — FKs require that order). Do NOT run plain `drizzle-kit push`: `user_sessions` is not in the Drizzle schema so push proposes dropping it. After tables exist, restart the API server; the boot seed (`ADMIN_USERNAME`/`ADMIN_PASSWORD`) creates the admin.

**Prod:** Replit's Publish flow diffs dev schema → prod and applies it; admin is seeded at boot from the global secrets. Do not write prod migration scripts.

**Why:** prevents re-diagnosing the same "login 500 after rollback" from scratch and prevents the destructive `drizzle-kit push` that drops the session table.
