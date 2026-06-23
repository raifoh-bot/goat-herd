import { and, eq, isNull } from "drizzle-orm";
import bcrypt from "bcrypt";
import { db, pool, usersTable } from "@workspace/db";

/**
 * One-time superadmin seed script.
 *
 * Reads SUPERADMIN_USERNAME and SUPERADMIN_PASSWORD from the environment and
 * creates a platform superadmin account (no farm). Superadmins bypass tenant
 * scoping and manage farms via the /superadmin panel. If a superadmin with that
 * username already exists, the script does nothing (it never overwrites an
 * existing password).
 *
 * Run with: pnpm --filter @workspace/scripts run seed-superadmin
 */
async function main() {
  const username = process.env.SUPERADMIN_USERNAME?.trim();
  const password = process.env.SUPERADMIN_PASSWORD;

  if (!username || !password) {
    throw new Error(
      "SUPERADMIN_USERNAME and SUPERADMIN_PASSWORD must be set to seed the superadmin account.",
    );
  }

  if (password.length < 8) {
    throw new Error("SUPERADMIN_PASSWORD must be at least 8 characters long.");
  }

  const [existing] = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.username, username), isNull(usersTable.farmId)));

  if (existing) {
    console.log(
      `Superadmin "${username}" already exists (id ${existing.id}); leaving it untouched.`,
    );
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const [user] = await db
    .insert(usersTable)
    .values({
      username,
      passwordHash,
      role: "superadmin",
      active: true,
      farmId: null,
    })
    .returning();

  console.log(`Created superadmin user "${user.username}" (id ${user.id}).`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
