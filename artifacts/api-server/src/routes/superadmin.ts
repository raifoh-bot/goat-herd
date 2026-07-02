import { Router, type IRouter } from "express";
import { and, asc, count, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import {
  db,
  pool,
  breedingsTable,
  farmsTable,
  goatsTable,
  usersTable,
  type Farm,
} from "@workspace/db";
import {
  CreateFarmBody,
  UpdateFarmBody,
  DeleteFarmBody,
  UpdatePlatformSettingsBody,
  GetPlatformSummaryResponse,
  GetPlatformSettingsResponse,
} from "@workspace/api-zod";
import { requireRole } from "../middlewares/auth";
import { createFarm } from "../lib/createFarm";
import { getPlatformSettings, updatePlatformSettings } from "../lib/platformSettings";

const router: IRouter = Router();

// The entire superadmin surface is restricted to platform superadmins.
router.use("/superadmin", requireRole("superadmin"));

/**
 * Durable per-farm activity floor: the newest `updated_at` across every tenant
 * table for the farm. Unlike session rows (which connect-pg-simple prunes once
 * expired), these rows persist indefinitely, so a farm that has been dormant for
 * months still reports an accurate, old last-active instant instead of collapsing
 * to "never". Keyed by farm id. Superadmin users (farm_id NULL) are excluded.
 */
async function dataActivityByFarmId(): Promise<Map<number, Date>> {
  const result = await pool.query<{ farm_id: number; last_active: Date }>(`
    SELECT farm_id, MAX(updated_at) AS last_active FROM (
      SELECT farm_id, updated_at FROM goats
      UNION ALL SELECT farm_id, updated_at FROM breedings
      UNION ALL SELECT farm_id, updated_at FROM breeding_events
      UNION ALL SELECT farm_id, updated_at FROM kids
      UNION ALL SELECT farm_id, updated_at FROM semen_straws
      UNION ALL SELECT farm_id, updated_at FROM farm_settings
      UNION ALL SELECT farm_id, updated_at FROM users WHERE farm_id IS NOT NULL
    ) activity
    GROUP BY farm_id
  `);
  return new Map(result.rows.map((r) => [r.farm_id, r.last_active]));
}

/**
 * Recent login recency per farm from the connect-pg-simple session store.
 * Sessions persist `farmSlug` and a rolling `expire` (last touch + the cookie's
 * maxAge), so the real last-touch instant is `expire - originalMaxAge`. This only
 * covers sessions still within their retention window, so it is layered ON TOP of
 * the durable data floor to capture pure-login activity (a user who signs in but
 * edits nothing). Superadmin sessions have no farmSlug and are excluded.
 */
async function sessionActivityByFarmSlug(): Promise<Map<string, Date>> {
  const result = await pool.query<{ slug: string; last_active: Date }>(`
    SELECT
      sess->>'farmSlug' AS slug,
      MAX(
        expire - make_interval(
          secs => COALESCE((sess->'cookie'->>'originalMaxAge')::double precision, 0) / 1000
        )
      ) AS last_active
    FROM user_sessions
    WHERE sess->>'farmSlug' IS NOT NULL
    GROUP BY sess->>'farmSlug'
  `);
  return new Map(result.rows.map((r) => [r.slug, r.last_active]));
}

/**
 * Enriches raw farm rows with per-farm counts and the combined last-active
 * instant. Shared by the list endpoint and the delete endpoint so both return
 * the same SuperadminFarm shape.
 */
async function enrichFarms(farms: Farm[]) {
  const userCounts = await db
    .select({ farmId: usersTable.farmId, value: count() })
    .from(usersTable)
    .groupBy(usersTable.farmId);
  const goatCounts = await db
    .select({ farmId: goatsTable.farmId, value: count() })
    .from(goatsTable)
    .groupBy(goatsTable.farmId);
  const breedingCounts = await db
    .select({ farmId: breedingsTable.farmId, value: count() })
    .from(breedingsTable)
    .groupBy(breedingsTable.farmId);

  const userCountByFarm = new Map(userCounts.map((r) => [r.farmId, r.value]));
  const goatCountByFarm = new Map(goatCounts.map((r) => [r.farmId, r.value]));
  const breedingCountByFarm = new Map(breedingCounts.map((r) => [r.farmId, r.value]));

  // Last active = the newest of the durable data floor (per farm id) and the
  // recent session signal (per farm slug). Combining the two keeps dormancy
  // accurate beyond session retention while still reflecting pure logins.
  const dataActive = await dataActivityByFarmId();
  const sessionActive = await sessionActivityByFarmSlug();
  const lastActiveAt = (farmId: number, slug: string): string | null => {
    const candidates = [dataActive.get(farmId), sessionActive.get(slug)].filter(
      (d): d is Date => d instanceof Date,
    );
    if (candidates.length === 0) return null;
    return new Date(Math.max(...candidates.map((d) => d.getTime()))).toISOString();
  };

  return farms.map((farm) => ({
    ...farm,
    userCount: userCountByFarm.get(farm.id) ?? 0,
    goatCount: goatCountByFarm.get(farm.id) ?? 0,
    breedingCount: breedingCountByFarm.get(farm.id) ?? 0,
    lastActiveAt: lastActiveAt(farm.id, farm.slug),
  }));
}

router.get("/superadmin/settings", async (_req, res): Promise<void> => {
  const settings = await getPlatformSettings();
  res.json(GetPlatformSettingsResponse.parse(settings));
});

router.put("/superadmin/settings", async (req, res): Promise<void> => {
  const parsed = UpdatePlatformSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  // Cross-field invariant the flat schema can't express: the yellow band must
  // extend past the green band, or the last-active color semantics are incoherent.
  if (parsed.data.idleWithinDays <= parsed.data.activeWithinDays) {
    res.status(400).json({ error: "idleWithinDays must be greater than activeWithinDays" });
    return;
  }
  const settings = await updatePlatformSettings(parsed.data);
  res.json(GetPlatformSettingsResponse.parse(settings));
});

router.get("/superadmin/summary", async (_req, res): Promise<void> => {
  const farms = await db.select().from(farmsTable);
  // Deleted farms are excluded from every platform total; they live only in the
  // deleted-farms record, not the active platform footprint.
  const liveFarms = farms.filter((f) => f.deletedAt === null);
  const liveFarmIds = liveFarms.map((f) => f.id);

  // Count only farm-bound users belonging to live farms; the platform
  // superadmin (farmId null) is not a tenant user, so excluding it keeps the
  // platform total equal to the sum of each live farm's user count.
  const [{ value: totalUsers }] =
    liveFarmIds.length === 0
      ? [{ value: 0 }]
      : await db
          .select({ value: count() })
          .from(usersTable)
          .where(and(isNotNull(usersTable.farmId), inArray(usersTable.farmId, liveFarmIds)));
  const [{ value: totalGoats }] =
    liveFarmIds.length === 0
      ? [{ value: 0 }]
      : await db
          .select({ value: count() })
          .from(goatsTable)
          .where(inArray(goatsTable.farmId, liveFarmIds));

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const summary = GetPlatformSummaryResponse.parse({
    totalFarms: liveFarms.length,
    activeFarms: liveFarms.filter((f) => f.status === "active").length,
    suspendedFarms: liveFarms.filter((f) => f.status === "suspended").length,
    totalUsers,
    totalGoats,
    farmsThisMonth: liveFarms.filter((f) => f.createdAt && f.createdAt >= startOfMonth).length,
  });

  res.json(summary);
});

router.get("/superadmin/farms", async (_req, res): Promise<void> => {
  // Include deleted farms so the client can render the deleted-farms record;
  // active ones sort first, then deletions by most-recent.
  const farms = await db.select().from(farmsTable).orderBy(asc(farmsTable.createdAt));
  res.json(await enrichFarms(farms));
});

router.post("/superadmin/farms", async (req, res): Promise<void> => {
  const parsed = CreateFarmBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const result = await createFarm({
    slug: parsed.data.slug,
    name: parsed.data.name,
    adminUsername: parsed.data.adminUsername,
    adminPassword: parsed.data.adminPassword,
  });

  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }

  res.status(201).json(result.farm);
});

router.put("/superadmin/farms/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const parsed = UpdateFarmBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.name !== undefined) updateData.name = parsed.data.name.trim();
  if (parsed.data.status !== undefined) updateData.status = parsed.data.status;

  // Never modify a deleted farm through the ordinary update path.
  const [farm] = await db
    .update(farmsTable)
    .set(updateData)
    .where(and(eq(farmsTable.id, id), isNull(farmsTable.deletedAt)))
    .returning();

  if (!farm) {
    res.status(404).json({ error: "Farm not found" });
    return;
  }

  res.json(farm);
});

router.post("/superadmin/farms/:id/delete", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const parsed = DeleteFarmBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Soft delete: only affects a farm that is not already deleted. The row (and
  // its data) is retained so the deletion is auditable and recoverable.
  const [farm] = await db
    .update(farmsTable)
    .set({
      deletedAt: new Date(),
      deletedReason: parsed.data.reason.trim(),
      deletedByUsername: req.authUser?.username ?? null,
      updatedAt: new Date(),
    })
    .where(and(eq(farmsTable.id, id), isNull(farmsTable.deletedAt)))
    .returning();

  if (!farm) {
    res.status(404).json({ error: "Farm not found" });
    return;
  }

  const [enriched] = await enrichFarms([farm]);
  res.json(enriched);
});

export default router;
