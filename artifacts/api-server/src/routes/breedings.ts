import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { db, breedingsTable, kidsTable, goatsTable } from "@workspace/db";
import {
  CreateBreedingBody,
  UpdateBreedingBody,
  AddKidsBody,
  GetBreedingParams,
  UpdateBreedingParams,
  AddKidsParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/breedings", async (req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(breedingsTable)
    .leftJoin(goatsTable, eq(breedingsTable.doeId, goatsTable.id))
    .orderBy(desc(breedingsTable.breedingDate));

  const result = rows.map((row) => ({
    ...row.breedings,
    doe: row.goats,
  }));

  res.json(result);
});

router.post("/breedings", async (req, res): Promise<void> => {
  const parsed = CreateBreedingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const doe = await db.select().from(goatsTable).where(eq(goatsTable.id, parsed.data.doeId));
  if (!doe.length) {
    res.status(404).json({ error: "Doe not found" });
    return;
  }

  const [breeding] = await db
    .insert(breedingsTable)
    .values({
      doeId: parsed.data.doeId,
      sireName: parsed.data.sireName,
      breedingDate: new Date(parsed.data.breedingDate),
      expectedKiddingDate: parsed.data.expectedKiddingDate ? new Date(parsed.data.expectedKiddingDate) : null,
      notes: parsed.data.notes,
      status: "bred",
    })
    .returning();

  await db
    .update(goatsTable)
    .set({ lactationStatus: "pregnant", updatedAt: new Date() })
    .where(eq(goatsTable.id, parsed.data.doeId));

  res.status(201).json(breeding);
});

router.get("/breedings/:id", async (req, res): Promise<void> => {
  const idParsed = GetBreedingParams.safeParse({ id: Number(req.params.id) });
  if (!idParsed.success) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const { id } = idParsed.data;

  const rows = await db
    .select()
    .from(breedingsTable)
    .leftJoin(goatsTable, eq(breedingsTable.doeId, goatsTable.id))
    .where(eq(breedingsTable.id, id));

  if (!rows.length) {
    res.status(404).json({ error: "Breeding not found" });
    return;
  }

  const kids = await db
    .select()
    .from(kidsTable)
    .where(eq(kidsTable.breedingId, id))
    .orderBy(kidsTable.createdAt);

  res.json({
    ...rows[0].breedings,
    doe: rows[0].goats,
    kids,
  });
});

router.put("/breedings/:id", async (req, res): Promise<void> => {
  const idParsed = UpdateBreedingParams.safeParse({ id: Number(req.params.id) });
  if (!idParsed.success) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const { id } = idParsed.data;

  const parsed = UpdateBreedingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.sireName !== undefined) updateData.sireName = parsed.data.sireName;
  if (parsed.data.breedingDate !== undefined) updateData.breedingDate = new Date(parsed.data.breedingDate);
  if (parsed.data.expectedKiddingDate !== undefined) updateData.expectedKiddingDate = new Date(parsed.data.expectedKiddingDate);
  if (parsed.data.status !== undefined) updateData.status = parsed.data.status;
  if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes;

  const [breeding] = await db
    .update(breedingsTable)
    .set(updateData)
    .where(eq(breedingsTable.id, id))
    .returning();

  if (!breeding) {
    res.status(404).json({ error: "Breeding not found" });
    return;
  }

  if (parsed.data.status === "confirmed-pregnant") {
    await db
      .update(goatsTable)
      .set({ lactationStatus: "pregnant", updatedAt: new Date() })
      .where(eq(goatsTable.id, breeding.doeId));
  }

  if (parsed.data.status === "open") {
    const doe = await db.select().from(goatsTable).where(eq(goatsTable.id, breeding.doeId));
    if (doe.length && doe[0].lactationStatus === "pregnant") {
      await db
        .update(goatsTable)
        .set({ lactationStatus: "dry", updatedAt: new Date() })
        .where(eq(goatsTable.id, breeding.doeId));
    }
  }

  res.json(breeding);
});

router.post("/breedings/:id/kids", async (req, res): Promise<void> => {
  const idParsed = AddKidsParams.safeParse({ id: Number(req.params.id) });
  if (!idParsed.success) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const breedingId = idParsed.data.id;

  const parsed = AddKidsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [breeding] = await db
    .select()
    .from(breedingsTable)
    .where(eq(breedingsTable.id, breedingId));

  if (!breeding) {
    res.status(404).json({ error: "Breeding not found" });
    return;
  }

  const kidRows = parsed.data.kids.map((kid) => ({
    breedingId,
    name: kid.name,
    sex: kid.sex,
    birthDate: kid.birthDate
      ? new Date(kid.birthDate)
      : parsed.data.birthDate
      ? new Date(parsed.data.birthDate)
      : null,
    birthWeight: kid.birthWeight,
    notes: kid.notes,
  }));

  const insertedKids = await db.insert(kidsTable).values(kidRows).returning();

  await db
    .update(breedingsTable)
    .set({ status: "kidded", updatedAt: new Date() })
    .where(eq(breedingsTable.id, breedingId));

  await db
    .update(goatsTable)
    .set({ lactationStatus: "milking", updatedAt: new Date() })
    .where(eq(goatsTable.id, breeding.doeId));

  res.status(201).json(insertedKids);
});

export default router;
