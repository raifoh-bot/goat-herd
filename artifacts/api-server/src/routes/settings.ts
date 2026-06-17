import { Router, type IRouter } from "express";
import { asc, eq } from "drizzle-orm";
import { db, farmSettingsTable } from "@workspace/db";
import { UpdateSettingsBody } from "@workspace/api-zod";
import { requireRole } from "../middlewares/auth";

const router: IRouter = Router();

// Only Admin/Owner may change farm settings; reads are allowed for any
// authenticated user (the whole router sits behind requireAuth).
const requireManager = requireRole("admin", "owner");

/**
 * Returns the single farm settings row, creating it if it somehow does not
 * exist yet (boot-time `ensureFarmSettings` normally guarantees it).
 */
async function getOrCreateSettings() {
  const [existing] = await db
    .select()
    .from(farmSettingsTable)
    .orderBy(asc(farmSettingsTable.id))
    .limit(1);
  if (existing) return existing;

  const [created] = await db
    .insert(farmSettingsTable)
    .values({ usesAi: true })
    .returning();
  return created;
}

router.get("/settings", async (_req, res): Promise<void> => {
  const settings = await getOrCreateSettings();
  res.json(settings);
});

router.put("/settings", requireManager, async (req, res): Promise<void> => {
  const parsed = UpdateSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const current = await getOrCreateSettings();

  // Apply only the fields that were actually provided so the client can save a
  // single setting at a time without clobbering the others.
  const { usesAi, farmName, adgaNumber, logoUrl, weightUnit, gestationDays } = parsed.data;
  const changes: Partial<typeof farmSettingsTable.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (usesAi !== undefined) changes.usesAi = usesAi;
  if (farmName !== undefined) changes.farmName = farmName.trim();
  if (adgaNumber !== undefined) {
    const trimmed = adgaNumber?.trim() ?? "";
    changes.adgaNumber = trimmed === "" ? null : trimmed;
  }
  if (logoUrl !== undefined) changes.logoUrl = logoUrl === "" ? null : logoUrl;
  if (weightUnit !== undefined) changes.weightUnit = weightUnit;
  if (gestationDays !== undefined) changes.gestationDays = gestationDays;

  const [updated] = await db
    .update(farmSettingsTable)
    .set(changes)
    .where(eq(farmSettingsTable.id, current.id))
    .returning();

  res.json(updated);
});

export default router;
