import { Router, type IRouter } from "express";
import { and, asc, count, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import bcrypt from "bcrypt";
import {
  db,
  pool,
  breedingsTable,
  farmsTable,
  farmApprovalTokensTable,
  farmSettingsTable,
  goatsTable,
  passwordResetTokensTable,
  usersTable,
  type Farm,
} from "@workspace/db";
import {
  CreateFarmBody,
  UpdateFarmBody,
  DeleteFarmBody,
  RejectFarmBody,
  SetUserPasswordBody,
  CreateSuperadminUserBody,
  UpdateSuperadminUserBody,
  UpdatePlatformSettingsBody,
  GetPlatformSummaryResponse,
  GetPlatformSettingsResponse,
} from "@workspace/api-zod";
import { requireRole } from "../middlewares/auth";
import { createFarm } from "../lib/createFarm";
import { approveFarmById } from "../lib/approveFarm";
import { sendFarmRejectedEmail } from "../lib/email";
import { logger } from "../lib/logger";
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
    pendingFarms: liveFarms.filter((f) => f.status === "pending").length,
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

/**
 * Approves a pending self-registered farm from the panel. Farms created by a
 * super-admin are active from the start and never pass through here.
 */
router.post("/superadmin/farms/:id/approve", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const [existing] = await db.select().from(farmsTable).where(eq(farmsTable.id, id));
  if (!existing || existing.deletedAt) {
    res.status(404).json({ error: "Farm not found" });
    return;
  }

  const result = await approveFarmById(req, id, `panel by ${req.authUser?.username}`);
  if (!result.ok) {
    res.status(409).json({ error: result.error });
    return;
  }

  res.json(result.farm);
});

/**
 * Rejects a pending farm registration with a recorded reason. The farm row
 * (and its slug) are retained for auditing — a rejected slug is intentionally
 * NOT reusable. Outstanding approval links are invalidated.
 */
router.post("/superadmin/farms/:id/reject", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const parsed = RejectFarmBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db.select().from(farmsTable).where(eq(farmsTable.id, id));
  if (!existing || existing.deletedAt) {
    res.status(404).json({ error: "Farm not found" });
    return;
  }

  // Only a farm still awaiting approval can be rejected.
  const [farm] = await db
    .update(farmsTable)
    .set({
      status: "rejected",
      rejectedAt: new Date(),
      rejectedReason: parsed.data.reason.trim(),
      rejectedByUsername: req.authUser?.username ?? null,
      updatedAt: new Date(),
    })
    .where(and(eq(farmsTable.id, id), eq(farmsTable.status, "pending"), isNull(farmsTable.deletedAt)))
    .returning();

  if (!farm) {
    res.status(409).json({ error: "This farm is not awaiting approval." });
    return;
  }

  // Kill any outstanding one-click approval links.
  await db
    .update(farmApprovalTokensTable)
    .set({ usedAt: new Date() })
    .where(and(eq(farmApprovalTokensTable.farmId, id), isNull(farmApprovalTokensTable.usedAt)));

  req.log.info(
    { farmId: id, farmSlug: farm.slug, superadmin: req.authUser?.username },
    "superadmin rejected a farm registration",
  );

  // Fire-and-forget: tell the registrant their farm was not approved. A broken
  // email must never affect the rejection itself.
  void (async () => {
    try {
      const [admin] = await db
        .select()
        .from(usersTable)
        .where(and(eq(usersTable.farmId, farm.id), eq(usersTable.role, "admin")));
      if (admin?.email) {
        await sendFarmRejectedEmail(admin.email, {
          farmName: farm.name,
          reason: farm.rejectedReason ?? "No reason provided.",
        });
      }
    } catch (err) {
      logger.error({ err, farmSlug: farm.slug }, "Failed to send farm-rejected email");
    }
  })();

  res.json(farm);
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

  // The approval lifecycle has its own endpoints — a pending or rejected farm
  // can't be flipped active/suspended through the generic update path.
  if (parsed.data.status !== undefined) {
    const [current] = await db.select().from(farmsTable).where(eq(farmsTable.id, id));
    if (current && (current.status === "pending" || current.status === "rejected")) {
      res.status(409).json({
        error: "Use the approve or reject actions for farms awaiting approval.",
      });
      return;
    }
  }

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

router.post("/superadmin/farms/:id/view", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  // Only live (non-deleted) farms can be viewed. Suspended farms are still
  // viewable for support, but resolveTenant blocks tenant reads for them, so the
  // client only offers "view" for active farms.
  const [farm] = await db
    .select()
    .from(farmsTable)
    .where(and(eq(farmsTable.id, id), isNull(farmsTable.deletedAt)));

  if (!farm) {
    res.status(404).json({ error: "Farm not found" });
    return;
  }

  // Audit trail: record that a platform admin opened this farm's data. The
  // access itself is read-only (enforced by superadminReadOnly middleware).
  req.log.info(
    { farmId: farm.id, farmSlug: farm.slug, superadmin: req.authUser?.username },
    "superadmin viewing farm data",
  );

  res.json({ slug: farm.slug, name: farm.name });
});

/** Public user shape — mirrors toPublicUser in routes/users.ts (no password hash). */
function toPublicUser(user: typeof usersTable.$inferSelect) {
  return {
    id: user.id,
    username: user.username,
    email: user.email ?? null,
    fullName: user.fullName ?? null,
    role: user.role,
    active: user.active,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

router.get("/superadmin/farms/:id/users", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const [farm] = await db.select().from(farmsTable).where(eq(farmsTable.id, id));
  if (!farm) {
    res.status(404).json({ error: "Farm not found" });
    return;
  }

  // Superadmins have no farmId, so they can never appear in this list.
  const users = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.farmId, id))
    .orderBy(desc(usersTable.createdAt));

  res.json(users.map(toPublicUser));
});

router.post(
  "/superadmin/farms/:id/users/:userId/reset-password",
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    const userId = Number(req.params.userId);
    if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(userId) || userId <= 0) {
      res.status(400).json({ error: "Invalid ID" });
      return;
    }

    const parsed = SetUserPasswordBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 10);

    // Scoping the update to (id = userId AND farm_id = :id) guarantees both
    // that the user belongs to the farm in the URL and that a superadmin
    // (farm_id NULL) can never be targeted through this endpoint.
    const [user] = await db
      .update(usersTable)
      .set({ passwordHash, updatedAt: new Date() })
      .where(and(eq(usersTable.id, userId), eq(usersTable.farmId, id)))
      .returning();

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    req.log.info(
      { farmId: id, targetUserId: userId, targetUsername: user.username, superadmin: req.authUser?.username },
      "superadmin reset a farm user's password",
    );

    res.sendStatus(204);
  },
);

router.get("/superadmin/users", async (_req, res): Promise<void> => {
  // Platform operators are the rows with no farm binding. Filtering on role too
  // guards against any legacy farm-less rows that are not superadmins.
  const users = await db
    .select()
    .from(usersTable)
    .where(and(isNull(usersTable.farmId), eq(usersTable.role, "superadmin")))
    .orderBy(desc(usersTable.createdAt));
  res.json(users.map(toPublicUser));
});

router.post("/superadmin/users", async (req, res): Promise<void> => {
  const parsed = CreateSuperadminUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const username = parsed.data.username.trim();
  if (!username) {
    res.status(400).json({ error: "Username is required" });
    return;
  }
  const email = parsed.data.email.trim();
  if (!email) {
    res.status(400).json({ error: "Email is required" });
    return;
  }

  // Super-admin usernames are unique among farm-less accounts (enforced by the
  // partial unique index); check first for a friendly 409.
  const [existing] = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.username, username), isNull(usersTable.farmId)));
  if (existing) {
    res.status(409).json({ error: "Username already taken" });
    return;
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);

  const [user] = await db
    .insert(usersTable)
    .values({
      farmId: null,
      username,
      email,
      passwordHash,
      role: "superadmin",
      active: true,
    })
    .returning();

  req.log.info(
    { newSuperadmin: user.username, createdBy: req.authUser?.username },
    "superadmin created a new super-admin account",
  );

  res.status(201).json(toPublicUser(user));
});

router.put("/superadmin/users/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const parsed = UpdateSuperadminUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // A super-admin can never deactivate their own account — that could lock the
  // platform out of all operator access.
  if (req.authUser?.id === id && parsed.data.active === false) {
    res.status(400).json({ error: "You cannot deactivate your own account" });
    return;
  }

  const updateData: Partial<typeof usersTable.$inferInsert> = { updatedAt: new Date() };
  if (parsed.data.active !== undefined) updateData.active = parsed.data.active;
  if (parsed.data.email !== undefined) {
    const email = parsed.data.email.trim();
    if (!email) {
      res.status(400).json({ error: "Email cannot be blank" });
      return;
    }
    updateData.email = email;
  }
  if (parsed.data.active === undefined && parsed.data.email === undefined) {
    res.status(400).json({ error: "Nothing to update" });
    return;
  }

  // Scope to farm-less superadmin rows so this endpoint can never touch a
  // tenant user.
  const [user] = await db
    .update(usersTable)
    .set(updateData)
    .where(
      and(
        eq(usersTable.id, id),
        isNull(usersTable.farmId),
        eq(usersTable.role, "superadmin"),
      ),
    )
    .returning();

  if (!user) {
    res.status(404).json({ error: "Super-admin not found" });
    return;
  }

  req.log.info(
    { targetSuperadmin: user.username, active: user.active, updatedBy: req.authUser?.username },
    "superadmin updated a super-admin account",
  );

  res.json(toPublicUser(user));
});

/**
 * Permanently purges a REJECTED farm so its slug becomes available for a fresh
 * registration. Unlike the soft delete below, this removes the farm row and
 * everything hanging off it (users and their reset tokens, settings, approval
 * tokens). It is deliberately restricted to rejected registrations — they never
 * went live, so there is no tenant data worth auditing beyond the rejection
 * itself, and freeing the address is the whole point.
 */
router.post("/superadmin/farms/:id/purge", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  // The status check MUST happen inside the transaction on a locked row —
  // otherwise a concurrent "approve anyway" between a pre-check and the deletes
  // could hard-delete a farm that is now active. FOR UPDATE serializes against
  // the approve/reject UPDATEs, and re-verifying the locked row's state means
  // no dependent rows are ever removed for a non-rejected farm.
  const purged = await db.transaction(async (tx): Promise<Farm | "not_found" | "not_rejected"> => {
    const {
      rows: [locked],
    } = await tx.execute<{ slug: string; status: string; deleted_at: Date | null }>(
      sql`SELECT slug, status, deleted_at FROM farms WHERE id = ${id} FOR UPDATE`,
    );
    if (!locked || locked.deleted_at) return "not_found";
    if (locked.status !== "rejected") return "not_rejected";

    const farmUsers = await tx
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.farmId, id));
    const userIds = farmUsers.map((u) => u.id);
    if (userIds.length > 0) {
      await tx
        .delete(passwordResetTokensTable)
        .where(inArray(passwordResetTokensTable.userId, userIds));
      await tx.delete(usersTable).where(inArray(usersTable.id, userIds));
    }
    await tx.delete(farmSettingsTable).where(eq(farmSettingsTable.farmId, id));
    await tx.delete(farmApprovalTokensTable).where(eq(farmApprovalTokensTable.farmId, id));
    const [farm] = await tx.delete(farmsTable).where(eq(farmsTable.id, id)).returning();
    return farm;
  });

  if (purged === "not_found") {
    res.status(404).json({ error: "Farm not found" });
    return;
  }
  if (purged === "not_rejected") {
    res.status(409).json({ error: "Only rejected registrations can be permanently deleted." });
    return;
  }

  req.log.info(
    { farmId: id, farmSlug: purged.slug, superadmin: req.authUser?.username },
    "superadmin permanently purged a rejected farm registration",
  );

  res.sendStatus(204);
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
