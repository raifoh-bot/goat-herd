import { pool } from "@workspace/db";
import { logger } from "./logger";

/**
 * Applies idempotent schema adjustments to the `goats` table that were
 * introduced after the table first shipped.
 *
 * Like `ensureSessionTable` and `ensureFarmSettings`, this runs at boot with
 * idempotent raw DDL so any database this server connects to (dev locally,
 * production when deployed) gets the change without a separate schema-push step.
 *
 * Center Tail tattoos can be up to 8 characters (other tattoo locations stay at
 * 4), so the `center_tail_tattoo` column is widened from varchar(4) to
 * varchar(8). The widening is guarded on the current column length so the table
 * is only rewritten once; subsequent boots are no-ops.
 *
 * The Herd page defaults its Herd Status filter to "On Farm", which the list API
 * applies as an exact-match filter. Goats predate the herd_status column, so any
 * row with a NULL herd_status would otherwise vanish from that default view. We
 * give the column a default of 'on-farm' and backfill existing NULLs to 'on-farm'
 * so unstatused goats are treated as on the farm. Both statements are idempotent.
 */
export async function ensureGoatColumns(): Promise<void> {
  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'goats'
          AND column_name = 'center_tail_tattoo'
          AND character_maximum_length IS NOT NULL
          AND character_maximum_length < 8
      ) THEN
        ALTER TABLE "goats" ALTER COLUMN "center_tail_tattoo" TYPE varchar(8);
      END IF;
    END $$;
  `);
  await pool.query(`ALTER TABLE "goats" ALTER COLUMN "herd_status" SET DEFAULT 'on-farm';`);
  await pool.query(`UPDATE "goats" SET "herd_status" = 'on-farm' WHERE "herd_status" IS NULL;`);
  logger.info("Ensured goats column adjustments (center_tail_tattoo varchar(8), herd_status default on-farm)");
}
