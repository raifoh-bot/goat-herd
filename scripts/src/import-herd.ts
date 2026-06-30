import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import {
  db,
  pool,
  farmsTable,
  goatsTable,
  breedingsTable,
  breedingEventsTable,
  kidsTable,
} from "@workspace/db";

const { Pool } = pg;

/**
 * Herd import script (cross-Replit, same schema).
 *
 * Imports goats, breedings, breeding events, and kids from another MyGoatHerd
 * PostgreSQL database into an existing tenant (farm) in this app. The source DB
 * must have the same schema as the destination.
 *
 * Required env vars:
 *   SOURCE_DATABASE_URL  connection string to the source database (read-only)
 *   SOURCE_FARM_SLUG     slug of the farm to copy FROM (in the source DB)
 *   TARGET_FARM_SLUG     slug of the farm to copy INTO (in this DB)
 *
 * Flags:
 *   --dry-run            log what would be imported, then roll back (no writes)
 *
 * Old IDs from the source are remapped to new IDs in the target so foreign keys
 * stay consistent. Goats already present (matched by name + date of birth) and
 * breedings already present (matched by doe + breeding date) are skipped rather
 * than duplicated, making the script safe to re-run.
 *
 * Run with: pnpm --filter @workspace/scripts run import-herd
 */

const dryRun = process.argv.includes("--dry-run");

class DryRunRollback extends Error {
  constructor() {
    super("dry-run rollback");
    this.name = "DryRunRollback";
  }
}

function sameDay(a: Date | null, b: Date | null): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  // Compare at calendar-day granularity (UTC) so duplicate detection is robust
  // to time-of-day / timezone drift across source and destination environments.
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

async function main() {
  const sourceUrl = process.env.SOURCE_DATABASE_URL;
  const sourceFarmSlug = process.env.SOURCE_FARM_SLUG?.trim();
  const targetFarmSlug = process.env.TARGET_FARM_SLUG?.trim();

  if (!sourceUrl) {
    throw new Error("SOURCE_DATABASE_URL must be set to the source database connection string.");
  }
  if (!sourceFarmSlug) {
    throw new Error("SOURCE_FARM_SLUG must be set to the farm slug to import from.");
  }
  if (!targetFarmSlug) {
    throw new Error("TARGET_FARM_SLUG must be set to the farm slug to import into.");
  }

  // Open the source connection read-only at the session level so the import can
  // never write to the source database, regardless of the queries we run.
  const sourcePool = new Pool({
    connectionString: sourceUrl,
    options: "-c default_transaction_read_only=on",
  });
  const sourceDb = drizzle(sourcePool);

  try {
    // Resolve target farm in the destination DB.
    const [targetFarm] = await db
      .select()
      .from(farmsTable)
      .where(eq(farmsTable.slug, targetFarmSlug));
    if (!targetFarm) {
      throw new Error(
        `Target farm "${targetFarmSlug}" not found in the destination database. Create it first.`,
      );
    }

    // Resolve source farm in the source DB.
    const [sourceFarm] = await sourceDb
      .select()
      .from(farmsTable)
      .where(eq(farmsTable.slug, sourceFarmSlug));
    if (!sourceFarm) {
      throw new Error(`Source farm "${sourceFarmSlug}" not found in the source database.`);
    }

    console.log(
      `Importing herd from source farm "${sourceFarm.slug}" (id ${sourceFarm.id}) ` +
        `into target farm "${targetFarm.slug}" (id ${targetFarm.id}).` +
        (dryRun ? " [DRY RUN — no changes will be written]" : ""),
    );

    // Fetch everything from the source up front (read-only).
    const sourceGoats = await sourceDb
      .select()
      .from(goatsTable)
      .where(eq(goatsTable.farmId, sourceFarm.id));
    const sourceBreedings = await sourceDb
      .select()
      .from(breedingsTable)
      .where(eq(breedingsTable.farmId, sourceFarm.id));
    const sourceEvents = await sourceDb
      .select()
      .from(breedingEventsTable)
      .where(eq(breedingEventsTable.farmId, sourceFarm.id));
    const sourceKids = await sourceDb
      .select()
      .from(kidsTable)
      .where(eq(kidsTable.farmId, sourceFarm.id));

    const stats = {
      goatsImported: 0,
      goatsSkipped: 0,
      breedingsImported: 0,
      breedingsSkipped: 0,
      eventsImported: 0,
      eventsSkipped: 0,
      kidsImported: 0,
      kidsSkipped: 0,
    };

    // sourceId -> destinationId maps so foreign keys stay consistent.
    const goatIdMap = new Map<number, number>();
    const breedingIdMap = new Map<number, number>();

    try {
      await db.transaction(async (tx) => {
        // --- Goats ---
        for (const goat of sourceGoats) {
          const { id, farmId, createdAt, updatedAt, ...rest } = goat;
          // Match existing goat by name + date of birth. Names are not unique
          // within a farm, so fetch every same-name goat and compare DOB across
          // all of them rather than only inspecting the first row.
          const sameNameGoats = await tx
            .select({ id: goatsTable.id, dateOfBirth: goatsTable.dateOfBirth })
            .from(goatsTable)
            .where(and(eq(goatsTable.farmId, targetFarm.id), eq(goatsTable.name, goat.name)));
          const matched = sameNameGoats.find((g) => sameDay(g.dateOfBirth, goat.dateOfBirth));

          if (matched) {
            // Map matched goats to their existing id so new breedings can attach.
            goatIdMap.set(id, matched.id);
            stats.goatsSkipped++;
            console.warn(`Skipping goat "${goat.name}" — already exists (id ${matched.id}).`);
            continue;
          }

          const [inserted] = await tx
            .insert(goatsTable)
            .values({ ...rest, farmId: targetFarm.id })
            .returning({ id: goatsTable.id });
          goatIdMap.set(id, inserted.id);
          stats.goatsImported++;
        }

        // --- Breedings ---
        for (const breeding of sourceBreedings) {
          const { id, farmId, createdAt, updatedAt, doeId, semenStrawId, ...rest } = breeding;
          const newDoeId = goatIdMap.get(doeId);
          if (newDoeId === undefined) {
            stats.breedingsSkipped++;
            console.warn(
              `Skipping breeding (source id ${id}) — its doe (source goat id ${doeId}) ` +
                `was not imported.`,
            );
            continue;
          }

          // Match existing breeding by doe + breeding date. The source breeding
          // identifies its doe only by FK, so we match on the mapped target
          // doeId (which resolves to the same-named, same-DOB target goat) — the
          // precise realization of "doe name + breeding date".
          const existingBreedings = await tx
            .select({ id: breedingsTable.id, breedingDate: breedingsTable.breedingDate })
            .from(breedingsTable)
            .where(
              and(eq(breedingsTable.farmId, targetFarm.id), eq(breedingsTable.doeId, newDoeId)),
            );
          const matched = existingBreedings.find((b) => sameDay(b.breedingDate, breeding.breedingDate));
          if (matched) {
            // Map matched breedings to their existing id so their events/kids
            // can still attach to a pre-existing breeding (events/kids have
            // their own dedup below, so this stays re-run safe).
            breedingIdMap.set(id, matched.id);
            stats.breedingsSkipped++;
            console.warn(
              `Skipping breeding (source id ${id}) — already exists (id ${matched.id}).`,
            );
            continue;
          }

          // semenStrawId references semen inventory which is out of scope; drop it.
          const [inserted] = await tx
            .insert(breedingsTable)
            .values({ ...rest, doeId: newDoeId, semenStrawId: null, farmId: targetFarm.id })
            .returning({ id: breedingsTable.id });
          breedingIdMap.set(id, inserted.id);
          stats.breedingsImported++;
        }

        // --- Breeding events ---
        for (const event of sourceEvents) {
          const { id, farmId, createdAt, updatedAt, breedingId, ...rest } = event;
          const newBreedingId = breedingIdMap.get(breedingId);
          if (newBreedingId === undefined) {
            stats.eventsSkipped++;
            console.warn(
              `Skipping breeding event (source id ${id}) — its breeding ` +
                `(source id ${breedingId}) was not imported.`,
            );
            continue;
          }
          // Skip if an equivalent event (same breeding, type, and day) already
          // exists in the target so re-runs don't duplicate events.
          const existingEvents = await tx
            .select({ eventType: breedingEventsTable.eventType, eventDate: breedingEventsTable.eventDate })
            .from(breedingEventsTable)
            .where(
              and(
                eq(breedingEventsTable.farmId, targetFarm.id),
                eq(breedingEventsTable.breedingId, newBreedingId),
              ),
            );
          const eventExists = existingEvents.some(
            (e) => e.eventType === event.eventType && sameDay(e.eventDate, event.eventDate),
          );
          if (eventExists) {
            stats.eventsSkipped++;
            continue;
          }
          await tx
            .insert(breedingEventsTable)
            .values({ ...rest, breedingId: newBreedingId, farmId: targetFarm.id });
          stats.eventsImported++;
        }

        // --- Kids ---
        for (const kid of sourceKids) {
          const { id, farmId, createdAt, updatedAt, breedingId, goatId, ...rest } = kid;
          const newBreedingId = breedingIdMap.get(breedingId);
          if (newBreedingId === undefined) {
            stats.kidsSkipped++;
            console.warn(
              `Skipping kid (source id ${id}) — its breeding ` +
                `(source id ${breedingId}) was not imported.`,
            );
            continue;
          }
          let newGoatId: number | null = null;
          if (goatId !== null) {
            const mapped = goatIdMap.get(goatId);
            if (mapped === undefined) {
              console.warn(
                `Kid (source id ${id}) references goat (source id ${goatId}) that was ` +
                  `not imported; leaving its goat link empty.`,
              );
            } else {
              newGoatId = mapped;
            }
          }
          // Skip if an equivalent kid (same breeding, name, sex, and birth day)
          // already exists in the target so re-runs don't duplicate kids.
          const existingKids = await tx
            .select({
              name: kidsTable.name,
              sex: kidsTable.sex,
              birthDate: kidsTable.birthDate,
            })
            .from(kidsTable)
            .where(
              and(
                eq(kidsTable.farmId, targetFarm.id),
                eq(kidsTable.breedingId, newBreedingId),
              ),
            );
          const kidExists = existingKids.some(
            (k) =>
              k.name === kid.name &&
              k.sex === kid.sex &&
              sameDay(k.birthDate, kid.birthDate),
          );
          if (kidExists) {
            stats.kidsSkipped++;
            continue;
          }
          await tx.insert(kidsTable).values({
            ...rest,
            breedingId: newBreedingId,
            goatId: newGoatId,
            farmId: targetFarm.id,
          });
          stats.kidsImported++;
        }

        if (dryRun) {
          throw new DryRunRollback();
        }
      });
    } catch (err) {
      if (err instanceof DryRunRollback) {
        console.log("Dry run complete — transaction rolled back, nothing was written.");
      } else {
        throw err;
      }
    }

    console.log("\nImport summary:");
    console.log(`  Goats:           ${stats.goatsImported} imported, ${stats.goatsSkipped} skipped`);
    console.log(
      `  Breedings:       ${stats.breedingsImported} imported, ${stats.breedingsSkipped} skipped`,
    );
    console.log(
      `  Breeding events: ${stats.eventsImported} imported, ${stats.eventsSkipped} skipped`,
    );
    console.log(`  Kids:            ${stats.kidsImported} imported, ${stats.kidsSkipped} skipped`);
    if (dryRun) {
      console.log("\n(Dry run — re-run without --dry-run to apply these changes.)");
    }
  } finally {
    await sourcePool.end();
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
