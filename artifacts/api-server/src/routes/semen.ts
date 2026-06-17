import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { db, semenStrawsTable } from "@workspace/db";
import { CreateSemenStrawBody, UpdateSemenStrawBody } from "@workspace/api-zod";
import { requireRole } from "../middlewares/auth";

const router: IRouter = Router();

// Semen inventory is read-only for Farm Hands; only Admin/Owner may modify it.
const requireManager = requireRole("admin", "owner");

router.get("/semen-straws", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(semenStrawsTable)
    .orderBy(desc(semenStrawsTable.createdAt));
  res.json(rows);
});

router.post("/semen-straws", requireManager, async (req, res): Promise<void> => {
  const parsed = CreateSemenStrawBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [straw] = await db
    .insert(semenStrawsTable)
    .values({
      sireName: parsed.data.sireName,
      strawId: parsed.data.strawId,
      supplier: parsed.data.supplier,
      count: parsed.data.count,
      tankLocation: parsed.data.tankLocation,
      notes: parsed.data.notes,
    })
    .returning();

  res.status(201).json(straw);
});

router.put("/semen-straws/:id", requireManager, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const parsed = UpdateSemenStrawBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.sireName !== undefined) updateData.sireName = parsed.data.sireName;
  if (parsed.data.strawId !== undefined) updateData.strawId = parsed.data.strawId || null;
  if (parsed.data.supplier !== undefined) updateData.supplier = parsed.data.supplier || null;
  if (parsed.data.count !== undefined) updateData.count = parsed.data.count;
  if (parsed.data.tankLocation !== undefined) updateData.tankLocation = parsed.data.tankLocation || null;
  if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes || null;

  const [straw] = await db
    .update(semenStrawsTable)
    .set(updateData)
    .where(eq(semenStrawsTable.id, id))
    .returning();

  if (!straw) {
    res.status(404).json({ error: "Semen straw entry not found" });
    return;
  }

  res.json(straw);
});

router.delete("/semen-straws/:id", requireManager, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const [straw] = await db.select().from(semenStrawsTable).where(eq(semenStrawsTable.id, id));
  if (!straw) {
    res.status(404).json({ error: "Semen straw entry not found" });
    return;
  }

  await db.delete(semenStrawsTable).where(eq(semenStrawsTable.id, id));
  res.status(204).send();
});

export default router;
