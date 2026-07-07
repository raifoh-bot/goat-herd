import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, farmSettingsTable, DEFAULT_ENABLED_BREEDS, type FarmSettings } from "@workspace/db";
import { UpdateSettingsBody } from "@workspace/api-zod";
import { requireRole } from "../middlewares/auth";
import { farmId } from "../middlewares/tenant";
import { normalizeDashboardLayout } from "../lib/dashboardWidgets";
import { normalizeHealthScheduleIntervals } from "../lib/healthSchedules";

const router: IRouter = Router();

// Only Admin/Owner may change farm settings; reads are allowed for any
// authenticated user (the whole router sits behind requireAuth).
const requireManager = requireRole("admin", "owner");

/**
 * In-memory settings defaults, mirroring the `farm_settings` column defaults.
 * Used only to answer a read for a farm whose settings row is somehow missing
 * WITHOUT writing — critical for the superadmin "view as farm" read-only mode.
 */
function defaultFarmSettings(fid: number): FarmSettings {
  return {
    id: 0,
    farmId: fid,
    usesAi: true,
    farmName: "MyGoatHerd",
    adgaNumber: null,
    logoUrl: null,
    weightUnit: "lb",
    gestationDays: 150,
    enabledBreeds: [...DEFAULT_ENABLED_BREEDS],
    dashboardLayout: null,
    famachaThreshold: 3,
    healthScheduleIntervals: null,
    updatedAt: new Date(),
  };
}

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
  const fid = farmId(req);
  // A superadmin viewing a farm must never cause a write. If the settings row is
  // missing, return in-memory defaults instead of auto-creating it. Regular farm
  // members keep the self-healing get-or-create behavior.
  let settings: FarmSettings;
  if (req.authUser?.role === "superadmin") {
    const [existing] = await db
      .select()
      .from(farmSettingsTable)
      .where(eq(farmSettingsTable.farmId, fid))
      .limit(1);
    settings = existing ?? defaultFarmSettings(fid);
  } else {
    settings = await getOrCreateSettings(fid);
  }
  res.json({
    ...settings,
    dashboardLayout: normalizeDashboardLayout(settings.dashboardLayout),
    healthScheduleIntervals: normalizeHealthScheduleIntervals(settings.healthScheduleIntervals),
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
    healthScheduleIntervals,
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
  if (healthScheduleIntervals !== undefined) {
    // Drop unknown keys and out-of-range values before persisting.
    changes.healthScheduleIntervals = normalizeHealthScheduleIntervals(healthScheduleIntervals);
  }
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
    healthScheduleIntervals: normalizeHealthScheduleIntervals(updated.healthScheduleIntervals),
  });
});

export default router;
