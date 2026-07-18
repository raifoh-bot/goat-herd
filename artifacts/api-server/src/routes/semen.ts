import { Router, type IRouter } from "express";
import { and, desc, eq, getTableColumns } from "drizzle-orm";
import { z } from "zod";
import { db, semenStrawsTable, semenTanksTable } from "@workspace/db";
import { CreateSemenStrawBody, UpdateSemenStrawBody } from "@workspace/api-zod";
import { requireRole } from "../middlewares/auth";
import { farmId } from "../middlewares/tenant";

const router: IRouter = Router();

// Semen inventory is read-only for Farm Hands; only Admin/Owner may modify it.
const requireManager = requireRole("admin", "owner");

// Strict per-row schema for CSV imports. Validated row-by-row so one bad row
// does not reject the whole file — invalid rows are reported back by index.
const importStrawRowSchema = z.object({
  sireName: z.string().trim().min(1, "Sire name is required"),
  count: z
    .number({ invalid_type_error: "Count must be a number" })
    .int("Count must be a whole number")
    .min(0, "Count cannot be negative"),
  strawId: z.string().optional(),
  supplier: z.string().optional(),
  tankLocation: z.string().optional(),
  sireDamName: z.string().optional(),
  sireSireName: z.string().optional(),
  sirePatGranddamName: z.string().optional(),
  sirePatGrandsireName: z.string().optional(),
  notes: z.string().optional(),
});

/** Verify a tankId belongs to this farm; returns true when valid (or null). */
async function tankBelongsToFarm(req: Parameters<typeof farmId>[0], tankId: number | null | undefined): Promise<boolean> {
  if (tankId == null) return true;
  const [tank] = await db
    .select({ id: semenTanksTable.id })
    .from(semenTanksTable)
    .where(and(eq(semenTanksTable.id, tankId), eq(semenTanksTable.farmId, farmId(req))));
  return Boolean(tank);
}

router.get("/semen-straws", async (req, res): Promise<void> => {
  const rows = await db
    .select({
      ...getTableColumns(semenStrawsTable),
      tankName: semenTanksTable.name,
    })
    .from(semenStrawsTable)
    .leftJoin(semenTanksTable, eq(semenStrawsTable.tankId, semenTanksTable.id))
    .where(eq(semenStrawsTable.farmId, farmId(req)))
    .orderBy(desc(semenStrawsTable.createdAt));
  res.json(rows);
});

router.post("/semen-straws", requireManager, async (req, res): Promise<void> => {
  const parsed = CreateSemenStrawBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (!(await tankBelongsToFarm(req, parsed.data.tankId))) {
    res.status(400).json({ error: "Tank not found" });
    return;
  }

  const [straw] = await db
    .insert(semenStrawsTable)
    .values({
      farmId: farmId(req),
      sireName: parsed.data.sireName,
      strawId: parsed.data.strawId,
      supplier: parsed.data.supplier,
      count: parsed.data.count,
      tankLocation: parsed.data.tankLocation,
      tankId: parsed.data.tankId ?? null,
      sireDamName: parsed.data.sireDamName,
      sireSireName: parsed.data.sireSireName,
      sirePatGranddamName: parsed.data.sirePatGranddamName,
      sirePatGrandsireName: parsed.data.sirePatGrandsireName,
      notes: parsed.data.notes,
    })
    .returning();

  res.status(201).json(straw);
});

router.post("/semen-straws/import", requireManager, async (req, res): Promise<void> => {
  const body = req.body as { straws?: unknown };
  if (!body || !Array.isArray(body.straws)) {
    res.status(400).json({ error: "Expected a 'straws' array" });
    return;
  }

  const rawRows = body.straws as unknown[];
  const failed: { index: number; reason: string }[] = [];
  const values: (typeof semenStrawsTable.$inferInsert)[] = [];

  // Validate each row independently so a single bad row does not block the rest.
  rawRows.forEach((raw, index) => {
    const parsed = importStrawRowSchema.safeParse(raw);
    if (!parsed.success) {
      const reason = parsed.error.issues.map((i) => i.message).join("; ");
      failed.push({ index, reason });
      return;
    }
    values.push({
      farmId: farmId(req),
      sireName: parsed.data.sireName,
      strawId: parsed.data.strawId,
      supplier: parsed.data.supplier,
      count: parsed.data.count,
      tankLocation: parsed.data.tankLocation,
      sireDamName: parsed.data.sireDamName,
      sireSireName: parsed.data.sireSireName,
      sirePatGranddamName: parsed.data.sirePatGranddamName,
      sirePatGrandsireName: parsed.data.sirePatGrandsireName,
      notes: parsed.data.notes,
    });
  });

  let imported = 0;
  if (values.length > 0) {
    try {
      await db.transaction(async (tx) => {
        const inserted = await tx.insert(semenStrawsTable).values(values).returning();
        imported = inserted.length;
      });
    } catch (err) {
      // A DB-level failure rolls back the whole transaction; report every
      // attempted row as failed so the count stays accurate.
      const reason = err instanceof Error ? err.message : "Database error during import";
      req.log.error({ err }, "Semen straw import transaction failed");
      values.forEach((_, i) => failed.push({ index: i, reason }));
      res.status(201).json({ imported: 0, skipped: failed.length, failed });
      return;
    }
  }

  res.status(201).json({ imported, skipped: failed.length, failed });
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

  if (parsed.data.tankId !== undefined && !(await tankBelongsToFarm(req, parsed.data.tankId))) {
    res.status(400).json({ error: "Tank not found" });
    return;
  }

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.sireName !== undefined) updateData.sireName = parsed.data.sireName;
  if (parsed.data.tankId !== undefined) updateData.tankId = parsed.data.tankId;
  if (parsed.data.strawId !== undefined) updateData.strawId = parsed.data.strawId || null;
  if (parsed.data.supplier !== undefined) updateData.supplier = parsed.data.supplier || null;
  if (parsed.data.count !== undefined) updateData.count = parsed.data.count;
  if (parsed.data.tankLocation !== undefined) updateData.tankLocation = parsed.data.tankLocation || null;
  if (parsed.data.sireDamName !== undefined) updateData.sireDamName = parsed.data.sireDamName || null;
  if (parsed.data.sireSireName !== undefined) updateData.sireSireName = parsed.data.sireSireName || null;
  if (parsed.data.sirePatGranddamName !== undefined) updateData.sirePatGranddamName = parsed.data.sirePatGranddamName || null;
  if (parsed.data.sirePatGrandsireName !== undefined) updateData.sirePatGrandsireName = parsed.data.sirePatGrandsireName || null;
  if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes || null;

  const [straw] = await db
    .update(semenStrawsTable)
    .set(updateData)
    .where(and(eq(semenStrawsTable.id, id), eq(semenStrawsTable.farmId, farmId(req))))
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

  const [straw] = await db
    .select()
    .from(semenStrawsTable)
    .where(and(eq(semenStrawsTable.id, id), eq(semenStrawsTable.farmId, farmId(req))));
  if (!straw) {
    res.status(404).json({ error: "Semen straw entry not found" });
    return;
  }

  await db
    .delete(semenStrawsTable)
    .where(and(eq(semenStrawsTable.id, id), eq(semenStrawsTable.farmId, farmId(req))));
  res.status(204).send();
});

export default router;
