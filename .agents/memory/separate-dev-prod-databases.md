---
name: Separate dev/prod databases
description: Dev and production use distinct PostgreSQL databases; prod is read-only via tools, so prod data seeding must run inside the deployed app.
---

This project's development and production environments use **separate** PostgreSQL
databases (confirmed by differing row counts across the same table). They are not
a single shared DB with a lagging replica.

**Why it matters:** Seeding/inserting data in the dev DB does NOT affect production.
The `executeSql` tool's `environment: "production"` mode is READ-ONLY (SELECT only),
so the agent cannot directly write rows (e.g. an admin user) into the prod DB from
its own environment. The production DATABASE_URL is runtime-injected only inside the
deployment and is not accessible to agent tooling.

**How to apply:** To seed/initialize data that must exist in production (e.g. a first
admin account), do it from code that runs *inside* the deployed app — e.g. an
idempotent boot-time seed in the api-server that runs against whatever DATABASE_URL
the server is connected to (dev locally, prod when published). Make such seeds
idempotent and race-safe: pre-check existence AND use `onConflictDoNothing` on the
unique column so multi-instance cold starts don't error or duplicate. Gate on the
relevant env secret being present so environments without it are unaffected. The
change only reaches prod after the user re-publishes.
