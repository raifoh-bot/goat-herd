---
name: drizzle push drops user_sessions
description: Why `pnpm --filter @workspace/db run push` warns about dropping user_sessions, and the safe way to apply goat/schema column changes.
---
`drizzle-kit push` warns "about to delete user_sessions table" and blocks interactively.

**Why:** The session table (`user_sessions`) is created at runtime by a boot-time `ensureSessionTable()` (connect-pg-simple with `createTableIfMissing:false`), so it is NOT in the Drizzle schema. `push` sees an unmanaged table and proposes dropping it — which would destroy live sessions.

**How to apply:** Never confirm that drop. For additive column changes (the common case), skip `push` and apply the columns directly with idempotent SQL via the code_execution `executeSql` callback, e.g. `ALTER TABLE goats ADD COLUMN IF NOT EXISTS <col> <type>;`, then verify via information_schema. Keep the Drizzle schema file in sync for type generation. (push is interactive/non-scriptable here, so direct SQL is both safer and faster.)
