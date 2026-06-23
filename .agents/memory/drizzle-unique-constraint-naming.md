---
name: Drizzle unique constraint naming
description: Drizzle's .unique() names constraints <table>_<col>_key, not _unique — migrations that DROP the wrong name silently leave the old constraint live.
---

# Drizzle `.unique()` generates `<table>_<col>_key`

When a column was declared with Drizzle's `.unique()` (e.g. `username: text().unique()`),
Postgres stores the constraint as `users_username_key` — NOT `users_username_unique`.

**Why this bites:** a hand-written boot migration that does
`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_username_unique` runs without error
(`IF EXISTS` swallows the miss) but the real `users_username_key` survives. Everything
typechecks and boots fine; the failure only appears at runtime as a unique-violation 500
when a second tenant reuses a value that should now be per-tenant unique (e.g. two farms
both registering username `admin`).

**How to apply:**
- Before dropping a Drizzle-generated unique constraint, confirm its actual name:
  `SELECT conname FROM pg_constraint WHERE conrelid='<table>'::regclass AND contype='u';`
- Drop BOTH plausible names defensively: `..._key` (Drizzle default) and `..._unique`
  (hand-rolled), each with `IF EXISTS`.
- For multi-tenant scoping, the global unique must be replaced by partial unique indexes
  (`(farm_id, col) WHERE farm_id IS NOT NULL` plus `(col) WHERE farm_id IS NULL`).
- curl-over-http will not store the dev session cookie (it is `Secure`); verify auth/HTTP
  flows through the HTTPS `$REPLIT_DEV_DOMAIN` so the cookie jar persists.
