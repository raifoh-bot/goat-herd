import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, farmSettingsTable } from "@workspace/db";
import { UpdateSettingsBody } from "@workspace/api-zod";
import { requireRole } from "../middlewares/auth";
import { farmId } from "../middlewares/tenant";
import { normalizeDashboardLayout } from "../lib/dashboardWidgets";

const router: IRouter = Router();

// Only Admin/Owner may change farm settings; reads are allowed for any
// authenticated user (the whole router sits behind requireAuth).
const requireManager = requireRole("admin", "owner");

/**
 * Returns the current farm's settings row, creating it if it somehow does not
 * exist yet (boot-time `ensureFarmSettings` / farm creation normally guarantees it).
 */
async function getOrCreateSettings(fid: number) {
  const [existing] = await db
    .select()
    .from(farmSettingsTable)
    .where(eq(farmSettingsTable.farmId, fid))
    .limit(1);
  if (existing) return existing;

  const [created] = await db
    .insert(farmSettingsTable)
    .values({ usesAi: true, farmId: fid })
    .returning();
  return created;
}

router.get("/settings", async (req, res): Promise<void> => {
  const settings = await getOrCreateSettings(farmId(req));
  res.json({
    ...settings,
    dashboardLayout: normalizeDashboardLayout(settings.dashboardLayout),
  });
});

router.put("/settings", requireManager, async (req, res): Promise<void> => {
  const parsed = UpdateSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const current = await getOrCreateSettings(farmId(req));

  // Apply only the fields that were actually provided so the client can save a
  // single setting at a time without clobbering the others.
  const {
    usesAi,
    farmName,
    adgaNumber,
    logoUrl,
    weightUnit,
    gestationDays,
    enabledBreeds,
    dashboardLayout,
    famachaThreshold,
  } = parsed.data;
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
  if (enabledBreeds !== undefined) {
    // De-dupe while preserving the catalog-validated entries Zod already checked.
    changes.enabledBreeds = Array.from(new Set(enabledBreeds));
  }
  if (famachaThreshold !== undefined) changes.famachaThreshold = famachaThreshold;
  if (dashboardLayout !== undefined) {
    // Normalize before persisting so unknown ids never get stored and any
    // missing widgets are filled in with defaults.
    changes.dashboardLayout = normalizeDashboardLayout(dashboardLayout);
  }

  const [updated] = await db
    .update(farmSettingsTable)
    .set(changes)
    .where(eq(farmSettingsTable.id, current.id))
    .returning();

  res.json({
    ...updated,
    dashboardLayout: normalizeDashboardLayout(updated.dashboardLayout),
  });
});

export default router;
