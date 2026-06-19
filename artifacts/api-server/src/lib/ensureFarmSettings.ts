import { pool } from "@workspace/db";
import { logger } from "./logger";

/**
 * Provisions the single-row `farm_settings` table and ensures exactly one row
 * exists.
 *
 * Like `ensureSessionTable`, this uses idempotent raw DDL so the table and its
 * default row are present at boot in any database this server connects to (dev
 * locally, production when deployed) without depending on a separate schema-push
 * step. The default `uses_ai = true` means existing farms see no behavior change
 * unless they explicitly opt out.
 */
export async function ensureFarmSettings(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "farm_settings" (
      "id" serial PRIMARY KEY,
      "uses_ai" boolean NOT NULL DEFAULT true,
      "updated_at" timestamp DEFAULT now() NOT NULL
    );
  `);
  // Idempotently add columns introduced after the table first shipped, so older
  // databases gain the new farm-wide settings without a separate migration step.
  await pool.query(`
    ALTER TABLE "farm_settings"
      ADD COLUMN IF NOT EXISTS "farm_name" text NOT NULL DEFAULT 'MyGoatHerd';
  `);
  await pool.query(`
    ALTER TABLE "farm_settings"
      ADD COLUMN IF NOT EXISTS "adga_number" varchar(50);
  `);
  await pool.query(`
    ALTER TABLE "farm_settings"
      ADD COLUMN IF NOT EXISTS "logo_url" text;
  `);
  await pool.query(`
    ALTER TABLE "farm_settings"
      ADD COLUMN IF NOT EXISTS "weight_unit" text NOT NULL DEFAULT 'lb';
  `);
  await pool.query(`
    ALTER TABLE "farm_settings"
      ADD COLUMN IF NOT EXISTS "gestation_days" integer NOT NULL DEFAULT 150;
  `);
  await pool.query(`
    ALTER TABLE "farm_settings"
      ADD COLUMN IF NOT EXISTS "enabled_breeds" text[] NOT NULL DEFAULT '{alpine,angora,boer,guernsey,kiko,lamancha,mixed,myotonic,nigerian-dwarf,nubian,oberhasli,pygmy,recorded-grade,saanen,sable,savanna,spanish,texmaster,toggenburg}'::text[];
  `);
  await pool.query(`
    INSERT INTO "farm_settings" ("uses_ai")
    SELECT true
    WHERE NOT EXISTS (SELECT 1 FROM "farm_settings");
  `);
  logger.info("Ensured farm_settings table and default row exist");
}
