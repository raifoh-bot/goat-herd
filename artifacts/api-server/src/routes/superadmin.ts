import { Router, type IRouter } from "express";
import { asc, count, eq } from "drizzle-orm";
import { db, farmsTable, goatsTable, usersTable } from "@workspace/db";
import { CreateFarmBody, UpdateFarmBody } from "@workspace/api-zod";
import { requireRole } from "../middlewares/auth";
import { createFarm } from "../lib/createFarm";

const router: IRouter = Router();

// The entire superadmin surface is restricted to platform superadmins.
router.use("/superadmin", requireRole("superadmin"));

router.get("/superadmin/farms", async (_req, res): Promise<void> => {
  const farms = await db.select().from(farmsTable).orderBy(asc(farmsTable.createdAt));

  const userCounts = await db
    .select({ farmId: usersTable.farmId, value: count() })
    .from(usersTable)
    .groupBy(usersTable.farmId);
  const goatCounts = await db
    .select({ farmId: goatsTable.farmId, value: count() })
    .from(goatsTable)
    .groupBy(goatsTable.farmId);

  const userCountByFarm = new Map(userCounts.map((r) => [r.farmId, r.value]));
  const goatCountByFarm = new Map(goatCounts.map((r) => [r.farmId, r.value]));

  res.json(
    farms.map((farm) => ({
      ...farm,
      userCount: userCountByFarm.get(farm.id) ?? 0,
      goatCount: goatCountByFarm.get(farm.id) ?? 0,
    })),
  );
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

  const [farm] = await db
    .update(farmsTable)
    .set(updateData)
    .where(eq(farmsTable.id, id))
    .returning();

  if (!farm) {
    res.status(404).json({ error: "Farm not found" });
    return;
  }

  res.json(farm);
});

export default router;
