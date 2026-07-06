import { pool } from "@workspace/db";
import { logger } from "./logger";

/**
 * Tenant tables that carry a NOT NULL farm_id (every row always belongs to a
 * farm). `users` is handled separately because superadmin accounts have a null
 * farm_id.
 */
const TENANT_TABLES = [
  "goats",
  "breedings",
  "kids",
  "breeding_events",
  "semen_straws",
  "farm_settings",
] as const;

async function tableExists(name: string): Promise<boolean> {
  const { rows } = await pool.query<{ reg: string | null }>(
    `SELECT to_regclass($1) AS reg`,
    [`public.${name}`],
  );
  return rows[0]?.reg != null;
}

async function ensureForeignKey(table: string, column: string): Promise<void> {
  const constraint = `${table}_${column}_farms_id_fk`;
  await pool.query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${constraint}') THEN
        ALTER TABLE "${table}" ADD CONSTRAINT "${constraint}"
          FOREIGN KEY ("${column}") REFERENCES "farms"("id");
      END IF;
    END $$;
  `);
}

/**
 * Idempotent boot-time migration that introduces multi-tenant (per-farm)
 * isolation. Like the other ensure* helpers, this uses raw idempotent DDL so it
 * is safe to run on every boot against any database (dev or prod) WITHOUT a
 * drizzle push (push would drop user_sessions and other untracked tables).
 *
 * It:
 *  1. Creates the `farms` table.
 *  2. Adds a `farm_id` column to `users` and every tenant table.
 *  3. Ensures a `default` farm exists to absorb pre-existing single-farm data.
 *  4. Backfills all NULL farm_id rows to the default farm.
 *  5. Adds FK constraints and (once backfilled) sets farm_id NOT NULL on tenant
 *     tables.
 *  6. Replaces the global username UNIQUE with per-farm uniqueness (and a
 *     separate global uniqueness for superadmins).
 *  7. Adds the one-settings-row-per-farm unique index and lookup indexes.
 *
 * Must run AFTER the base tables exist and AFTER ensureFarmSettings (which
 * creates farm_settings + its legacy singleton row).
 */
export async function ensureMultiTenant(): Promise<void> {
  // 1. farms table.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "farms" (
      "id" serial PRIMARY KEY,
      "slug" text NOT NULL UNIQUE,
      "name" text NOT NULL,
      "status" text NOT NULL DEFAULT 'active',
      "created_at" timestamp DEFAULT now() NOT NULL,
      "updated_at" timestamp DEFAULT now() NOT NULL
    );
  `);

  // 2. farm_id columns. users.farm_id is nullable (superadmins have none).
  const usersPresent = await tableExists("users");
  if (usersPresent) {
    await pool.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "farm_id" integer;`);
    await pool.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_login_at" timestamp;`);
    await pool.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "dashboard_layout" jsonb;`);
  }
  const presentTenantTables: string[] = [];
  for (const table of TENANT_TABLES) {
    if (await tableExists(table)) {
      presentTenantTables.push(table);
      await pool.query(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "farm_id" integer;`);
    }
  }

  // 3. Ensure a default farm. ON CONFLICT ... DO UPDATE lets us RETURNING the id
  //    whether the row was just inserted or already existed.
  const { rows } = await pool.query<{ id: number }>(`
    INSERT INTO "farms" ("slug", "name")
    VALUES ('default', 'My Farm')
    ON CONFLICT ("slug") DO UPDATE SET "slug" = EXCLUDED."slug"
    RETURNING "id";
  `);
  const defaultFarmId = rows[0].id;

  // Give the default farm a friendlier name from any pre-existing settings row.
  if (presentTenantTables.includes("farm_settings")) {
    await pool.query(
      `
        UPDATE "farms"
        SET "name" = sub.farm_name
        FROM (SELECT "farm_name" FROM "farm_settings" ORDER BY "id" LIMIT 1) AS sub
        WHERE "farms"."id" = $1
          AND "farms"."name" = 'My Farm'
          AND sub.farm_name IS NOT NULL
          AND sub.farm_name <> '';
      `,
      [defaultFarmId],
    );
  }

  // 4. Backfill existing rows to the default farm.
  if (usersPresent) {
    await pool.query(
      `UPDATE "users" SET "farm_id" = $1 WHERE "farm_id" IS NULL AND "role" <> 'superadmin';`,
      [defaultFarmId],
    );
  }
  for (const table of presentTenantTables) {
    await pool.query(`UPDATE "${table}" SET "farm_id" = $1 WHERE "farm_id" IS NULL;`, [
      defaultFarmId,
    ]);
  }

  // 5. FK constraints + NOT NULL on tenant tables (only once fully backfilled).
  if (usersPresent) {
    await ensureForeignKey("users", "farm_id");
  }
  for (const table of presentTenantTables) {
    await ensureForeignKey(table, "farm_id");
    await pool.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM "${table}" WHERE "farm_id" IS NULL) THEN
          ALTER TABLE "${table}" ALTER COLUMN "farm_id" SET NOT NULL;
        END IF;
      END $$;
    `);
  }

  // 6. Username uniqueness is per-farm, not global. Drop the legacy global
  //    UNIQUE constraint and replace it with partial unique indexes.
  if (usersPresent) {
    // Drizzle's `.unique()` generated `users_username_key`; an older hand-rolled
    // migration may instead have created `users_username_unique`. Drop whichever
    // global username constraint exists so usernames can repeat across farms.
    await pool.query(`ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_username_unique";`);
    await pool.query(`ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_username_key";`);
    await pool.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "users_farm_username_key" ON "users" ("farm_id", "username") WHERE "farm_id" IS NOT NULL;`,
    );
    await pool.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "users_superadmin_username_key" ON "users" ("username") WHERE "farm_id" IS NULL;`,
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS "users_farm_id_idx" ON "users" ("farm_id");`,
    );
  }

  // 7. One settings row per farm + lookup indexes.
  if (presentTenantTables.includes("farm_settings")) {
    await pool.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "farm_settings_farm_id_key" ON "farm_settings" ("farm_id");`,
    );
  }
  for (const table of presentTenantTables) {
    if (table === "farm_settings") continue;
    await pool.query(
      `CREATE INDEX IF NOT EXISTS "${table}_farm_id_idx" ON "${table}" ("farm_id");`,
    );
  }

  // 8a. Pregnancy tests table. Created directly with farm_id NOT NULL (there is
  //     no legacy single-farm data to backfill), plus FKs to farms + breedings
  //     and a farm_id lookup index.
  if (presentTenantTables.includes("breedings")) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "pregnancy_tests" (
        "id" serial PRIMARY KEY,
        "farm_id" integer NOT NULL REFERENCES "farms"("id"),
        "breeding_id" integer NOT NULL REFERENCES "breedings"("id"),
        "test_date" timestamp NOT NULL,
        "method" text NOT NULL,
        "result" text NOT NULL,
        "tested_by" text,
        "notes" text,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
      );
    `);
    await pool.query(
      `CREATE INDEX IF NOT EXISTS "pregnancy_tests_farm_id_idx" ON "pregnancy_tests" ("farm_id");`,
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS "pregnancy_tests_breeding_id_idx" ON "pregnancy_tests" ("breeding_id");`,
    );
  }

  // 8b. Health events table (hoof trims, CDT shots, copper bolus, FAMACHA
  //     scores, dewormings). Created directly with farm_id NOT NULL — there is
  //     no legacy single-farm data to backfill — plus FKs to farms + goats and
  //     lookup indexes.
  if (presentTenantTables.includes("goats")) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "health_events" (
        "id" serial PRIMARY KEY,
        "farm_id" integer NOT NULL REFERENCES "farms"("id"),
        "goat_id" integer NOT NULL REFERENCES "goats"("id"),
        "event_type" text NOT NULL,
        "event_date" timestamp NOT NULL,
        "famacha_score" integer,
        "dosage_ml" double precision,
        "body_weight" double precision,
        "product_name" text,
        "notes" text,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
      );
    `);
    await pool.query(
      `CREATE INDEX IF NOT EXISTS "health_events_farm_id_idx" ON "health_events" ("farm_id");`,
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS "health_events_goat_id_idx" ON "health_events" ("goat_id");`,
    );
  }

  // 8. Goats can carry up to 4 photos. Add the image_urls array column and
  //    migrate any existing single image_url into it exactly once. The legacy
  //    image_url column is left in place (nullable) but no longer written to.
  if (presentTenantTables.includes("goats")) {
    await pool.query(
      `ALTER TABLE "goats" ADD COLUMN IF NOT EXISTS "image_urls" text[] DEFAULT '{}'::text[] NOT NULL;`,
    );
    await pool.query(
      `UPDATE "goats" SET "image_urls" = ARRAY["image_url"] WHERE "image_url" IS NOT NULL AND "image_url" <> '' AND "image_urls" = '{}';`,
    );
    await pool.query(
      `ALTER TABLE "goats" ADD COLUMN IF NOT EXISTS "default_photo_index" integer;`,
    );
  }

  logger.info("Ensured multi-tenant schema (farms + farm_id scoping)");
}
