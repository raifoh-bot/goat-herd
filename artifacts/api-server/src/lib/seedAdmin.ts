import { and, eq } from "drizzle-orm";
import bcrypt from "bcrypt";
import { db, usersTable, farmsTable } from "@workspace/db";
import { logger } from "./logger";

/**
 * Idempotent admin seed run at server startup.
 *
 * Reads ADMIN_USERNAME and ADMIN_PASSWORD from the environment and ensures an
 * admin account exists in whatever database this server is connected to (dev
 * locally, production when deployed). It never overwrites an existing account,
 * so it is safe to run on every boot. When the env vars are absent it is a
 * no-op, so environments without those secrets are unaffected.
 */
export async function seedAdmin(): Promise<void> {
  const username = process.env["ADMIN_USERNAME"]?.trim();
  const password = process.env["ADMIN_PASSWORD"];

  if (!username || !password) {
    return;
  }

  if (password.length < 8) {
    logger.warn("ADMIN_PASSWORD is shorter than 8 characters; skipping admin seed.");
    return;
  }

  // The seeded admin belongs to the `default` farm (created by ensureMultiTenant,
  // which absorbs any pre-existing single-farm data).
  const [defaultFarm] = await db
    .select()
    .from(farmsTable)
    .where(eq(farmsTable.slug, "default"));

  if (!defaultFarm) {
    logger.warn("Default farm not found; skipping admin seed.");
    return;
  }

  const [existing] = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.username, username), eq(usersTable.farmId, defaultFarm.id)));

  if (existing) {
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const [user] = await db
    .insert(usersTable)
    .values({ username, passwordHash, role: "admin", active: true, farmId: defaultFarm.id })
    .returning();

  if (user) {
    logger.info({ username: user.username, id: user.id }, "Seeded admin user");
  }
}
