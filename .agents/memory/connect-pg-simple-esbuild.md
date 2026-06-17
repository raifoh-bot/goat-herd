---
name: connect-pg-simple + esbuild bundling
description: Why connect-pg-simple's createTableIfMissing breaks in the bundled api-server, and how sessions are provisioned instead.
---

# connect-pg-simple session store breaks when bundled

`connect-pg-simple`'s `createTableIfMissing: true` reads its `table.sql` file
relative to its own module directory via `__dirname`. The api-server is bundled
with esbuild into `dist/index.mjs`, which rewrites `__dirname` to the bundle
location, so the lookup becomes `dist/table.sql` — a file that does not exist.

**Symptom:** every session write throws `ENOENT ... dist/table.sql`. Login
returns 200 but the session row is never persisted, so the very next request is
401. In the UI this looks like "blank data / can't do anything" and can cause a
client-side redirect ping-pong between `/login` and protected routes.

**Why:** the ensure-table step runs before the actual INSERT, so it fails even
when the `user_sessions` table already exists in the database.

**How to apply:** keep `createTableIfMissing: false` in the session store config
and provision the table ourselves at boot with idempotent DDL
(`ensureSessionTable()` called before `app.listen`). Tests that exercise
login must call `ensureSessionTable()` in `beforeAll` since they bypass
`index.ts`. This affects BOTH dev and prod because the dev workflow also runs
the esbuild bundle.
