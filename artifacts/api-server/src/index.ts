import app from "./app";
import { logger } from "./lib/logger";
import { seedAdmin } from "./lib/seedAdmin";
import { seedSuperadmin } from "./lib/seedSuperadmin";
import { ensureSessionTable } from "./lib/ensureSessionTable";
import { ensureFarmSettings } from "./lib/ensureFarmSettings";
import { ensureGoatColumns } from "./lib/ensureGoatColumns";
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

async function start(): Promise<void> {
  // Provision the session table before serving traffic so the very first
  // login can persist a session.
  await ensureSessionTable();

  // Ensure a farm settings row always exists so reads never 404.
  await ensureFarmSettings();

  // Apply idempotent goats column adjustments (e.g. widened center_tail_tattoo).
  await ensureGoatColumns();

  // Provision multi-tenant scoping (farms table, farm_id columns, default farm,
  // backfill). Must run after the base tables and farm_settings exist.
  await ensureMultiTenant();

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");

    seedAdmin().catch((err) => {
      logger.error({ err }, "Admin seed failed");
    });

    seedSuperadmin().catch((err) => {
      logger.error({ err }, "Superadmin seed failed");
    });
  });
}

start().catch((err) => {
  logger.error({ err }, "Failed to start server");
  process.exit(1);
});
