import { Router, type IRouter } from "express";
import { and, asc, eq, sql } from "drizzle-orm";
import { db, semenTanksTable, semenStrawsTable } from "@workspace/db";
import { CreateSemenTankBody, UpdateSemenTankBody } from "@workspace/api-zod";
import { requireRole } from "../middlewares/auth";
import { farmId } from "../middlewares/tenant";

const router: IRouter = Router();

// Tanks are read-only for Farm Hands; only Admin/Owner may modify them.
const requireManager = requireRole("admin", "owner");

router.get("/semen-tanks", async (req, res): Promise<void> => {
  const rows = await db
    .select({
      id: semenTanksTable.id,
      name: semenTanksTable.name,
      lastServiceDate: semenTanksTable.lastServiceDate,
      notes: semenTanksTable.notes,
      createdAt: semenTanksTable.createdAt,
      updatedAt: semenTanksTable.updatedAt,
      strawEntryCount: sql<number>`(
        SELECT COUNT(*)::int FROM ${semenStrawsTable}
        WHERE ${semenStrawsTable.tankId} = ${semenTanksTable.id}
      )`,
    })
    .from(semenTanksTable)
    .where(eq(semenTanksTable.farmId, farmId(req)))
    .orderBy(asc(semenTanksTable.name));
  res.json(rows);
});

router.post("/semen-tanks", requireManager, async (req, res): Promise<void> => {
  const parsed = CreateSemenTankBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [tank] = await db
    .insert(semenTanksTable)
    .values({
      farmId: farmId(req),
      name: parsed.data.name,
      lastServiceDate: parsed.data.lastServiceDate ? new Date(parsed.data.lastServiceDate) : null,
      notes: parsed.data.notes,
    })
    .returning();

  res.status(201).json({ ...tank, strawEntryCount: 0 });
});

router.put("/semen-tanks/:id", requireManager, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const parsed = UpdateSemenTankBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
  if (parsed.data.lastServiceDate !== undefined) {
    updateData.lastServiceDate = parsed.data.lastServiceDate
      ? new Date(parsed.data.lastServiceDate)
      : null;
  }
  if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes || null;

  const [tank] = await db
    .update(semenTanksTable)
    .set(updateData)
    .where(and(eq(semenTanksTable.id, id), eq(semenTanksTable.farmId, farmId(req))))
    .returning();

  if (!tank) {
    res.status(404).json({ error: "Tank not found" });
    return;
  }

  const [{ count }] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(semenStrawsTable)
    .where(and(eq(semenStrawsTable.tankId, id), eq(semenStrawsTable.farmId, farmId(req))));

  res.json({ ...tank, strawEntryCount: count });
});

router.delete("/semen-tanks/:id", requireManager, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const [tank] = await db
    .select()
    .from(semenTanksTable)
    .where(and(eq(semenTanksTable.id, id), eq(semenTanksTable.farmId, farmId(req))));
  if (!tank) {
    res.status(404).json({ error: "Tank not found" });
    return;
  }

  // Block deletion while straw entries still point at this tank so no straw
  // silently loses its location.
  const [{ count }] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(semenStrawsTable)
    .where(and(eq(semenStrawsTable.tankId, id), eq(semenStrawsTable.farmId, farmId(req))));
  if (count > 0) {
    res.status(409).json({
      error: `This tank still has ${count} straw ${count === 1 ? "entry" : "entries"} assigned. Reassign them first.`,
    });
    return;
  }

  await db
    .delete(semenTanksTable)
    .where(and(eq(semenTanksTable.id, id), eq(semenTanksTable.farmId, farmId(req))));
  res.status(204).send();
});

export default router;
