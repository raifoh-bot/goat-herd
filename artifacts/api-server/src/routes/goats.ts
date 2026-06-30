import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, goatsTable } from "@workspace/db";
import {
  CreateGoatBody,
  DeleteGoatParams,
  GetGoatParams,
  ImportGoatsBody,
  ListGoatsQueryParams,
  UpdateGoatBody,
  UpdateGoatParams,
} from "@workspace/api-zod";
import { requireRole } from "../middlewares/auth";
import { farmId } from "../middlewares/tenant";
import { sendCsv } from "../lib/csv";

const router: IRouter = Router();

// Goats are read-only for Farm Hands; only Admin/Owner may create, edit, or delete.
const requireManager = requireRole("admin", "owner");

router.get("/goats", async (req, res): Promise<void> => {
  const params = ListGoatsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const conditions = [eq(goatsTable.farmId, farmId(req))];
  if (params.data.status) {
    conditions.push(eq(goatsTable.herdStatus, params.data.status));
  }
  if (params.data.sex) {
    conditions.push(eq(goatsTable.sex, params.data.sex));
  }

  const goats = await db
    .select()
    .from(goatsTable)
    .where(and(...conditions))
    .orderBy(desc(goatsTable.createdAt));

  res.json(goats);
});

router.post("/goats", requireManager, async (req, res): Promise<void> => {
  const parsed = CreateGoatBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [goat] = await db
    .insert(goatsTable)
    .values({ ...parsed.data, farmId: farmId(req) })
    .returning();
  res.status(201).json(goat);
});

router.post("/goats/import", requireManager, async (req, res): Promise<void> => {
  const parsed = ImportGoatsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  let imported = 0;
  const errors: string[] = [];

  for (let i = 0; i < parsed.data.goats.length; i++) {
    const row = parsed.data.goats[i];
    try {
      await db.insert(goatsTable).values({
        farmId: farmId(req),
        name: row.name,
        registeredName: row.registeredName ?? null,
        adgaId: row.adgaId ?? null,
        sex: row.sex ?? null,
        breed: row.breed,
        dateOfBirth: row.dateOfBirth ? new Date(row.dateOfBirth) : null,
        damName: row.damName ?? "",
        sireName: row.sireName ?? "",
        maternalGranddamName: row.maternalGranddamName ?? "",
        maternalGrandsireName: row.maternalGrandsireName ?? "",
        paternalGranddamName: row.paternalGranddamName ?? "",
        paternalGrandsireName: row.paternalGrandsireName ?? "",
        rightEarTattoo: row.rightEarTattoo ? row.rightEarTattoo.slice(0, 4) : null,
        leftEarTattoo: row.leftEarTattoo ? row.leftEarTattoo.slice(0, 4) : null,
        rightTailTattoo: row.rightTailTattoo ? row.rightTailTattoo.slice(0, 4) : null,
        leftTailTattoo: row.leftTailTattoo ? row.leftTailTattoo.slice(0, 4) : null,
        centerTailTattoo: row.centerTailTattoo ? row.centerTailTattoo.slice(0, 8) : null,
        eidNumber: row.eidNumber ?? null,
        lactationStatus: row.lactationStatus ?? null,
      });
      imported++;
    } catch (err) {
      errors.push(`Row ${i + 1} (${row.name}): ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }

  res.status(201).json({ imported, skipped: parsed.data.goats.length - imported - errors.length, errors });
});

// Export the farm's full herd as a CSV download. Read-only, so any
// authenticated farm member (including Farm Hands) may export.
router.get("/goats/export", async (req, res): Promise<void> => {
  const goats = await db
    .select()
    .from(goatsTable)
    .where(eq(goatsTable.farmId, farmId(req)))
    .orderBy(desc(goatsTable.createdAt));

  const headers = [
    "id",
    "name",
    "registeredName",
    "adgaId",
    "sex",
    "breed",
    "status",
    "herdStatus",
    "lactationStatus",
    "dateOfBirth",
    "damName",
    "sireName",
    "maternalGranddamName",
    "maternalGrandsireName",
    "paternalGranddamName",
    "paternalGrandsireName",
    "milkPerDay",
    "description",
    "imageUrl",
    "createdAt",
  ];

  const rows = goats.map((g) => [
    g.id,
    g.name,
    g.registeredName,
    g.adgaId,
    g.sex,
    g.breed,
    g.status,
    g.herdStatus,
    g.lactationStatus,
    g.dateOfBirth,
    g.damName,
    g.sireName,
    g.maternalGranddamName,
    g.maternalGrandsireName,
    g.paternalGranddamName,
    g.paternalGrandsireName,
    g.milkPerDay,
    g.description,
    g.imageUrl,
    g.createdAt,
  ]);

  sendCsv(res, `${req.farm!.slug}-herd`, headers, rows);
});

router.get("/goats/:id", async (req, res): Promise<void> => {
  const params = GetGoatParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [goat] = await db
    .select()
    .from(goatsTable)
    .where(and(eq(goatsTable.id, params.data.id), eq(goatsTable.farmId, farmId(req))));

  if (!goat) {
    res.status(404).json({ error: "Goat not found" });
    return;
  }

  res.json(goat);
});

router.put("/goats/:id", requireManager, async (req, res): Promise<void> => {
  const params = UpdateGoatParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateGoatBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [goat] = await db
    .update(goatsTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(goatsTable.id, params.data.id), eq(goatsTable.farmId, farmId(req))))
    .returning();

  if (!goat) {
    res.status(404).json({ error: "Goat not found" });
    return;
  }

  res.json(goat);
});

router.delete("/goats/:id", requireManager, async (req, res): Promise<void> => {
  const params = DeleteGoatParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [goat] = await db
    .delete(goatsTable)
    .where(and(eq(goatsTable.id, params.data.id), eq(goatsTable.farmId, farmId(req))))
    .returning();

  if (!goat) {
    res.status(404).json({ error: "Goat not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
