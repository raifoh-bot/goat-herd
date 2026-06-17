import { eq } from "drizzle-orm";
import bcrypt from "bcrypt";
import { db, pool, usersTable } from "@workspace/db";

/**
 * One-time admin seed script.
 *
 * Reads ADMIN_USERNAME and ADMIN_PASSWORD from the environment and creates an
 * admin account. If a user with that username already exists, the script does
 * nothing (it never overwrites an existing password).
 *
 * Run with: pnpm --filter @workspace/scripts run seed-admin
 */
async function main() {
  const username = process.env.ADMIN_USERNAME?.trim();
  const password = process.env.ADMIN_PASSWORD;

  if (!username || !password) {
    throw new Error(
      "ADMIN_USERNAME and ADMIN_PASSWORD must be set to seed the admin account.",
    );
  }

  if (password.length < 8) {
    throw new Error("ADMIN_PASSWORD must be at least 8 characters long.");
  }

  const [existing] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.username, username));

  if (existing) {
    console.log(
      `User "${username}" already exists (id ${existing.id}); leaving it untouched.`,
    );
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const [user] = await db
    .insert(usersTable)
    .values({ username, passwordHash, role: "admin", active: true })
    .returning();

  console.log(`Created admin user "${user.username}" (id ${user.id}).`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
