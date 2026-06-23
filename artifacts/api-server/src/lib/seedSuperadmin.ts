import { and, eq, isNull } from "drizzle-orm";
import bcrypt from "bcrypt";
import { db, usersTable } from "@workspace/db";
import { logger } from "./logger";

/**
 * Idempotent superadmin seed run at server startup.
 *
 * Reads SUPERADMIN_USERNAME and SUPERADMIN_PASSWORD from the environment and
 * ensures a platform superadmin account (no farm) exists. Superadmins bypass
 * tenant scoping and manage farms via the /superadmin panel. It never
 * overwrites an existing account and is a no-op when the env vars are absent.
 */
export async function seedSuperadmin(): Promise<void> {
  const username = process.env["SUPERADMIN_USERNAME"]?.trim();
  const password = process.env["SUPERADMIN_PASSWORD"];

  if (!username || !password) {
    return;
  }

  if (password.length < 8) {
    logger.warn("SUPERADMIN_PASSWORD is shorter than 8 characters; skipping superadmin seed.");
    return;
  }

  const [existing] = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.username, username), isNull(usersTable.farmId)));

  if (existing) {
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const [user] = await db
    .insert(usersTable)
    .values({ username, passwordHash, role: "superadmin", active: true, farmId: null })
    .returning();

  if (user) {
    logger.info({ username: user.username, id: user.id }, "Seeded superadmin user");
  }
}
