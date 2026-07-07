---
name: Superadmin read-only view & side-effecting GETs
description: A method-based read-only guard for superadmin "view as farm" does not cover GET handlers that write; audit and neutralize those individually.
---

A middleware that enforces read-only by blocking non-safe HTTP methods (POST/PUT/DELETE/PATCH) for a role is NOT sufficient to guarantee read-only. Any GET that mutates on read defeats it.

**Why:** In this app the superadmin "view as farm" mode relies on `superadminReadOnly` blocking unsafe methods. But `GET /api/settings` used a get-or-create helper that INSERTs a `farm_settings` row when missing — so a superadmin merely opening a farm could write tenant data. Read-only must be judged per side effect, not per HTTP verb.

**How to apply:** When adding/auditing a read-only support/impersonation mode, grep for get-or-create / lazy-init / "self-healing" patterns behind GET routes (upserts, insert-on-miss, last-seen timestamps, counters). For the read-only role, branch to return in-memory defaults instead of writing; keep the self-healing path for real members. Mirror column defaults from a single exported constant (e.g. `DEFAULT_ENABLED_BREEDS` in the db schema) so the in-memory default can't drift from the DB default. Add a regression test: delete the row, do the GET as the read-only role, assert row count unchanged.
