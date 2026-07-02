---
name: Singleton config tables
description: How to safely implement a single-row platform/global config table under concurrency.
---

Single-row global config tables (e.g. platform-wide settings shared by the whole
platform) must anchor every read/create to a **fixed primary key** and create the
row via an atomic `INSERT ... ON CONFLICT (id) DO NOTHING`, then select by that id.

**Why:** a read-then-insert "get-or-create" races: two concurrent first requests
both see no row and both insert, producing duplicate config rows and ambiguous
reads. A fixed-PK atomic upsert makes racing callers converge on the same row.

**How to apply:** pin the singleton to `id = 1`; `getOrCreate` = upsert-by-id then
select-by-id; `update` targets the same fixed id. Do not order-by/limit-1 over a
serial id for singletons. Cross-field validation that a flat schema/OpenAPI can't
express (e.g. band ordering `idleWithinDays > activeWithinDays`) must be enforced
server-side in the route handler, not only in the UI.
