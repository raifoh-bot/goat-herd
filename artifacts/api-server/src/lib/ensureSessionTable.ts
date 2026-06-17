import { pool } from "@workspace/db";
import { logger } from "./logger";

/**
 * Creates the `user_sessions` table used by connect-pg-simple if it does not
 * already exist.
 *
 * connect-pg-simple's own `createTableIfMissing` option reads a `table.sql`
 * file relative to its module directory. When the server is bundled with
 * esbuild, `__dirname` is rewritten to the bundle location (`dist/`), so the
 * lookup becomes `dist/table.sql`, which does not exist — causing every session
 * write to throw ENOENT and silently dropping the session. To avoid depending
 * on that file, we disable `createTableIfMissing` and provision the table here
 * with idempotent DDL that matches connect-pg-simple's expected schema.
 */
export async function ensureSessionTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "user_sessions" (
      "sid" varchar NOT NULL COLLATE "default" PRIMARY KEY,
      "sess" json NOT NULL,
      "expire" timestamp(6) NOT NULL
    );
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "user_sessions" ("expire");`,
  );
  logger.info("Ensured user_sessions table exists");
}
