import app from "./app";
import { logger } from "./lib/logger";
import { seedAdmin } from "./lib/seedAdmin";
import { seedSuperadmin } from "./lib/seedSuperadmin";
import { ensureSessionTable } from "./lib/ensureSessionTable";
import { ensureFarmSettings } from "./lib/ensureFarmSettings";
import { ensureMultiTenant } from "./lib/ensureMultiTenant";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

/**
 * Idempotent boot-time provisioning (session table, farm settings, multi-tenant
 * scoping) plus the first-admin/superadmin seeds.
 *
 * This runs in the BACKGROUND, after the server is already listening, and never
 * blocks the port from opening. During a blue-green deploy promote the previous
 * version is still draining and can hold table locks; if provisioning ran before
 * `app.listen()`, a contended lock would stall boot, the `/api/healthz` probe
 * would never pass, and the promote would fail. By serving first we guarantee
 * the health check succeeds regardless of lock contention — and in production
 * the schema is already applied by the Publish dev->prod diff, so these calls
 * are redundant safety nets rather than the source of truth.
 */
async function provision(): Promise<void> {
  // Ensure the connect-pg-simple session table exists (it is app-owned and not
  // part of the Drizzle schema, so neither `db push` nor Publish create it).
  await ensureSessionTable();

  // Ensure a farm settings row always exists so reads never 404.
  await ensureFarmSettings();

  // Provision multi-tenant scoping (farms table, farm_id columns, default farm,
  // backfill). Must run after the base tables and farm_settings exist.
  await ensureMultiTenant();

  seedAdmin().catch((err) => {
    logger.error({ err }, "Admin seed failed");
  });

  seedSuperadmin().catch((err) => {
    logger.error({ err }, "Superadmin seed failed");
  });
}

function start(): void {
  // Open the port first so the deploy health check passes immediately and a
  // promote can never be blocked by a boot-time schema lock.
  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");

    void provision().catch((err) => {
      logger.error({ err }, "Background provisioning failed");
    });
  });
}

start();
