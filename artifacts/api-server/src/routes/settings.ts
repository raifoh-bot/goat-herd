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

  const [updated] = await db
    .update(farmSettingsTable)
    .set({ usesAi: parsed.data.usesAi, updatedAt: new Date() })
    .where(eq(farmSettingsTable.id, current.id))
    .returning();

  res.json(updated);
});

export default router;
