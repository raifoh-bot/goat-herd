import { Router, type IRouter } from "express";
import { asc, desc, eq, max } from "drizzle-orm";
import { db, breedingsTable, kidsTable, goatsTable, breedingEventsTable } from "@workspace/db";
import {
  CreateBreedingBody,
  UpdateBreedingBody,
  AddKidsBody,
  GetBreedingParams,
  UpdateBreedingParams,
  AddKidsParams,
  DeleteBreedingParams,
  UpdateKidBody,
  UpdateKidParams,
  DeleteKidParams,
  CreateBreedingEventBody,
  CreateBreedingEventParams,
  DeleteBreedingEventParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/breedings", async (req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(breedingsTable)
    .leftJoin(goatsTable, eq(breedingsTable.doeId, goatsTable.id))
    .orderBy(desc(breedingsTable.breedingDate));

  const allKids = await db.select().from(kidsTable).orderBy(kidsTable.createdAt);

  const kidsByBreeding = allKids.reduce<Record<number, typeof allKids>>((acc, kid) => {
    if (!acc[kid.breedingId]) acc[kid.breedingId] = [];
    acc[kid.breedingId].push(kid);
    return acc;
  }, {});

  const allEvents = await db.select().from(breedingEventsTable);

  const eventsByBreeding = allEvents.reduce<Record<number, typeof allEvents>>((acc, event) => {
    if (!acc[event.breedingId]) acc[event.breedingId] = [];
    acc[event.breedingId].push(event);
    return acc;
  }, {});

  const now = Date.now();

  const result = rows.map((row) => {
    const events = eventsByBreeding[row.breedings.id] ?? [];

    // Find the most recent "exposed" or "removed" event to determine current state
    const latestRelevantEvent = events
      .filter((e) => e.eventType === "exposed" || e.eventType === "removed")
      .sort((a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime())[0];

    const hasActiveExposure = latestRelevantEvent?.eventType === "exposed";

    let exposedDays: number | null = null;
    if (hasActiveExposure) {
      // Find the most recent "exposed" event (the one that started the current exposure run)
      const currentExposedEvent = events
        .filter((e) => e.eventType === "exposed")
        .sort((a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime())[0];
      if (currentExposedEvent) {
        exposedDays = Math.floor((now - new Date(currentExposedEvent.eventDate).getTime()) / (1000 * 60 * 60 * 24));
      }
    }

    return {
      ...row.breedings,
      doe: row.goats,
      kids: kidsByBreeding[row.breedings.id] ?? [],
      hasActiveExposure,
      exposedDays,
    };
  });

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

  const initialStatus = parsed.data.status ?? "bred";

  const [breeding] = await db
    .insert(breedingsTable)
    .values({
      doeId: parsed.data.doeId,
      sireName: parsed.data.sireName,
      breedingDate: new Date(parsed.data.breedingDate),
      expectedKiddingDate: parsed.data.expectedKiddingDate ? new Date(parsed.data.expectedKiddingDate) : null,
      notes: parsed.data.notes,
      status: initialStatus,
    })
    .returning();

  await db
    .update(goatsTable)
    .set({ lactationStatus: "exposed", updatedAt: new Date() })
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

  const events = await db
    .select()
    .from(breedingEventsTable)
    .where(eq(breedingEventsTable.breedingId, id))
    .orderBy(asc(breedingEventsTable.eventDate));

  res.json({
    ...rows[0].breedings,
    doe: rows[0].goats,
    kids,
    events,
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

  // Fetch breeding + full doe record (we need pedigree fields)
  const breedingRows = await db
    .select()
    .from(breedingsTable)
    .leftJoin(goatsTable, eq(breedingsTable.doeId, goatsTable.id))
    .where(eq(breedingsTable.id, breedingId));

  if (!breedingRows.length) {
    res.status(404).json({ error: "Breeding not found" });
    return;
  }

  const breeding = breedingRows[0].breedings;
  const doe = breedingRows[0].goats;

  const birthDate = parsed.data.birthDate ? new Date(parsed.data.birthDate) : null;

  // Insert kid records first (without goatId)
  const kidRows = parsed.data.kids.map((kid) => ({
    breedingId,
    name: kid.name,
    sex: kid.sex,
    kidStatus: (kid.kidStatus ?? "alive") as "alive" | "dead" | "doa" | "sold",
    birthDate: kid.birthDate ? new Date(kid.birthDate) : birthDate,
    birthWeight: kid.birthWeight,
    notes: kid.notes,
  }));

  const insertedKids = await db.insert(kidsTable).values(kidRows).returning();

  // For each alive or sold kid, create a goat herd record with full pedigree
  // Skip if skipHerdAdd is set (e.g. historical kidding records)
  if (!parsed.data.skipHerdAdd) for (const kid of insertedKids) {
    if (kid.kidStatus !== "alive" && kid.kidStatus !== "sold" && kid.kidStatus !== "dead") continue;

    const kidName = kid.name ?? (kid.sex === "doe" ? "Unnamed Doe" : "Unnamed Buck");

    const [newGoat] = await db
      .insert(goatsTable)
      .values({
        name: kidName,
        sex: kid.sex,
        breed: doe?.breed ?? "mixed",
        dateOfBirth: kid.birthDate,
        lactationStatus: "kid",
        herdStatus: kid.kidStatus === "sold" ? "sold" : kid.kidStatus === "dead" ? "dead" : null,
        // Dam info (the doe from this breeding)
        damName: doe?.registeredName ?? doe?.name ?? "",
        // Sire info (the buck name from this breeding)
        sireName: breeding.sireName,
        // Maternal grands = dam's parents
        maternalGranddamName: doe?.damName ?? "",
        maternalGrandsireName: doe?.sireName ?? "",
        // Paternal grands = not tracked (sire is a name string only)
        paternalGranddamName: "",
        paternalGrandsireName: "",
      })
      .returning();

    // Link the kid record back to the new goat
    await db
      .update(kidsTable)
      .set({ goatId: newGoat.id })
      .where(eq(kidsTable.id, kid.id));
  }

  // Mark breeding as kidded and update doe's lactation status
  await db
    .update(breedingsTable)
    .set({ status: "kidded", updatedAt: new Date() })
    .where(eq(breedingsTable.id, breedingId));

  await db
    .update(goatsTable)
    .set({ lactationStatus: "milking", updatedAt: new Date() })
    .where(eq(goatsTable.id, breeding.doeId));

  // Return kids with goatId populated
  const finalKids = await db.select().from(kidsTable).where(eq(kidsTable.breedingId, breedingId));
  res.status(201).json(finalKids);
});

router.put("/breedings/:id/kids/:kidId", async (req, res): Promise<void> => {
  const paramsParsed = UpdateKidParams.safeParse({ id: Number(req.params.id), kidId: Number(req.params.kidId) });
  if (!paramsParsed.success) {
    res.status(400).json({ error: "Invalid IDs" });
    return;
  }

  const parsed = UpdateKidBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db.select().from(kidsTable).where(eq(kidsTable.id, paramsParsed.data.kidId));
  if (!existing) {
    res.status(404).json({ error: "Kid not found" });
    return;
  }

  const updateData: Partial<typeof existing> = { updatedAt: new Date() };
  if (parsed.data.name !== undefined) updateData.name = parsed.data.name || null;
  if (parsed.data.sex !== undefined) updateData.sex = parsed.data.sex;
  if (parsed.data.kidStatus !== undefined) updateData.kidStatus = parsed.data.kidStatus as "alive" | "dead" | "doa" | "sold";
  if (parsed.data.birthDate !== undefined) updateData.birthDate = new Date(parsed.data.birthDate);
  if (parsed.data.birthWeight !== undefined) updateData.birthWeight = parsed.data.birthWeight ?? null;
  if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes || null;

  const [updated] = await db.update(kidsTable).set(updateData).where(eq(kidsTable.id, paramsParsed.data.kidId)).returning();

  // Sync the linked goat's name, sex, and herdStatus if it exists
  if (updated.goatId) {
    const goatUpdate: Record<string, unknown> = { updatedAt: new Date() };
    if (parsed.data.name !== undefined) goatUpdate.name = parsed.data.name || (updated.sex === "doe" ? "Unnamed Doe" : "Unnamed Buck");
    if (parsed.data.sex !== undefined) goatUpdate.sex = parsed.data.sex;
    if (parsed.data.kidStatus !== undefined) {
      if (parsed.data.kidStatus === "sold") goatUpdate.herdStatus = "sold";
      else if (parsed.data.kidStatus === "dead") goatUpdate.herdStatus = "dead";
      else if (parsed.data.kidStatus === "alive") goatUpdate.herdStatus = "on-farm";
    }
    if (Object.keys(goatUpdate).length > 1) {
      await db.update(goatsTable).set(goatUpdate).where(eq(goatsTable.id, updated.goatId));
    }
  }

  res.json(updated);
});

router.delete("/breedings/:id/kids/:kidId", async (req, res): Promise<void> => {
  const paramsParsed = DeleteKidParams.safeParse({ id: Number(req.params.id), kidId: Number(req.params.kidId) });
  if (!paramsParsed.success) {
    res.status(400).json({ error: "Invalid IDs" });
    return;
  }

  const [kid] = await db.select().from(kidsTable).where(eq(kidsTable.id, paramsParsed.data.kidId));
  if (!kid) {
    res.status(404).json({ error: "Kid not found" });
    return;
  }

  await db.delete(kidsTable).where(eq(kidsTable.id, paramsParsed.data.kidId));

  res.status(204).send();
});

router.post("/breedings/:id/events", async (req, res): Promise<void> => {
  const idParsed = CreateBreedingEventParams.safeParse({ id: Number(req.params.id) });
  if (!idParsed.success) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const parsed = CreateBreedingEventBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [breeding] = await db.select().from(breedingsTable).where(eq(breedingsTable.id, idParsed.data.id));
  if (!breeding) {
    res.status(404).json({ error: "Breeding not found" });
    return;
  }

  const [event] = await db
    .insert(breedingEventsTable)
    .values({
      breedingId: idParsed.data.id,
      eventType: parsed.data.eventType,
      eventDate: new Date(parsed.data.eventDate),
      notes: parsed.data.notes,
    })
    .returning();

  // If a cover event was logged, recalculate expectedKiddingDate and set doe's status to "serviced"
  if (parsed.data.eventType === "cover") {
    const coverEvents = await db
      .select()
      .from(breedingEventsTable)
      .where(eq(breedingEventsTable.breedingId, idParsed.data.id));
    const covers = coverEvents.filter((e) => e.eventType === "cover").sort(
      (a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime()
    );
    if (covers.length > 0) {
      const latestCover = new Date(covers[0].eventDate);
      const newKiddingDate = new Date(latestCover.getTime() + 145 * 24 * 60 * 60 * 1000);
      await db
        .update(breedingsTable)
        .set({ expectedKiddingDate: newKiddingDate, updatedAt: new Date() })
        .where(eq(breedingsTable.id, idParsed.data.id));
    }

    await db
      .update(goatsTable)
      .set({ lactationStatus: "serviced", updatedAt: new Date() })
      .where(eq(goatsTable.id, breeding.doeId));
  }

  res.status(201).json(event);
});

router.delete("/breedings/:id/events/:eventId", async (req, res): Promise<void> => {
  const paramsParsed = DeleteBreedingEventParams.safeParse({
    id: Number(req.params.id),
    eventId: Number(req.params.eventId),
  });
  if (!paramsParsed.success) {
    res.status(400).json({ error: "Invalid IDs" });
    return;
  }

  const [event] = await db
    .select()
    .from(breedingEventsTable)
    .where(
      eq(breedingEventsTable.id, paramsParsed.data.eventId)
    );

  if (!event || event.breedingId !== paramsParsed.data.id) {
    res.status(404).json({ error: "Event not found" });
    return;
  }

  await db.delete(breedingEventsTable).where(eq(breedingEventsTable.id, paramsParsed.data.eventId));

  // If it was a cover event, recalculate expectedKiddingDate from remaining covers
  if (event.eventType === "cover") {
    const remainingEvents = await db
      .select()
      .from(breedingEventsTable)
      .where(eq(breedingEventsTable.breedingId, paramsParsed.data.id));
    const covers = remainingEvents
      .filter((e) => e.eventType === "cover")
      .sort((a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime());
    if (covers.length > 0) {
      const latestCover = new Date(covers[0].eventDate);
      const newKiddingDate = new Date(latestCover.getTime() + 145 * 24 * 60 * 60 * 1000);
      await db
        .update(breedingsTable)
        .set({ expectedKiddingDate: newKiddingDate, updatedAt: new Date() })
        .where(eq(breedingsTable.id, paramsParsed.data.id));
    }
    // If no covers remain, leave expectedKiddingDate as-is (preserve manually entered value)
  }

  res.status(204).send();
});

router.delete("/breedings/:id", async (req, res): Promise<void> => {
  const idParsed = DeleteBreedingParams.safeParse({ id: Number(req.params.id) });
  if (!idParsed.success) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const { id } = idParsed.data;

  const [breeding] = await db.select().from(breedingsTable).where(eq(breedingsTable.id, id));
  if (!breeding) {
    res.status(404).json({ error: "Breeding not found" });
    return;
  }

  await db.delete(kidsTable).where(eq(kidsTable.breedingId, id));
  await db.delete(breedingEventsTable).where(eq(breedingEventsTable.breedingId, id));
  await db.delete(breedingsTable).where(eq(breedingsTable.id, id));

  res.status(204).send();
});

export default router;
