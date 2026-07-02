import { eq } from "drizzle-orm";
import { db, platformSettingsTable, type PlatformSettings } from "@workspace/db";

// The platform-settings table is a true singleton: the whole platform shares one
// row, pinned to this fixed id. Anchoring every access to the same primary key
// (via an atomic INSERT ... ON CONFLICT DO NOTHING) makes concurrent first
// access safe — it can never create a second row.
const SINGLETON_ID = 1;

/**
 * Reads the single platform-settings row, creating it with defaults on first
 * access. Safe under concurrency: the create is an atomic upsert on the fixed
 * primary key, so racing callers converge on the same row.
 */
export async function getPlatformSettings(): Promise<PlatformSettings> {
  await db
    .insert(platformSettingsTable)
    .values({ id: SINGLETON_ID })
    .onConflictDoNothing();
  const [row] = await db
    .select()
    .from(platformSettingsTable)
    .where(eq(platformSettingsTable.id, SINGLETON_ID));
  return row;
}

/** Updates the singleton platform-settings row and returns the new state. */
export async function updatePlatformSettings(values: {
  abandonedAfterDays: number;
  activeWithinDays: number;
  idleWithinDays: number;
}): Promise<PlatformSettings> {
  await getPlatformSettings(); // ensure the singleton row exists
  const [updated] = await db
    .update(platformSettingsTable)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(platformSettingsTable.id, SINGLETON_ID))
    .returning();
  return updated;
}
