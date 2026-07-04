import { Router, type IRouter } from "express";
import { and, asc, desc, eq, max } from "drizzle-orm";
import { db, breedingsTable, kidsTable, goatsTable, breedingEventsTable, semenStrawsTable, pregnancyTestsTable } from "@workspace/db";
import { farmId } from "../middlewares/tenant";
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
  UpdateBreedingEventBody,
  UpdateBreedingEventParams,
  DeleteBreedingEventParams,
  ImportBreedingsBody,
  ImportKidsBody,
  CreatePregnancyTestBody,
  CreatePregnancyTestParams,
} from "@workspace/api-zod";
import { requireRole } from "../middlewares/auth";
import { sendCsv } from "../lib/csv";

const router: IRouter = Router();

// Farm Hands may record breedings, kiddings, and events, but only Admin/Owner
// may delete breeding records, kids, or events.
const requireManager = requireRole("admin", "owner");

router.get("/breedings", async (req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(breedingsTable)
    .leftJoin(goatsTable, eq(breedingsTable.doeId, goatsTable.id))
    .where(eq(breedingsTable.farmId, farmId(req)))
    .orderBy(desc(breedingsTable.breedingDate));

  const allKids = await db
    .select()
    .from(kidsTable)
    .where(eq(kidsTable.farmId, farmId(req)))
    .orderBy(kidsTable.createdAt);

  const kidsByBreeding = allKids.reduce<Record<number, typeof allKids>>((acc, kid) => {
    if (!acc[kid.breedingId]) acc[kid.breedingId] = [];
    acc[kid.breedingId].push(kid);
    return acc;
  }, {});

  const allEvents = await db
    .select()
    .from(breedingEventsTable)
    .where(eq(breedingEventsTable.farmId, farmId(req)));

  const eventsByBreeding = allEvents.reduce<Record<number, typeof allEvents>>((acc, event) => {
    if (!acc[event.breedingId]) acc[event.breedingId] = [];
    acc[event.breedingId].push(event);
    return acc;
  }, {});

  const now = Date.now();

  const result = rows.map((row) => {
    const events = eventsByBreeding[row.breedings.id] ?? [];

    // Find the most recent "exposed" or "removed" event to determine current state
    // Use id as tiebreaker for same-date events (higher id = logged later)
    const latestRelevantEvent = events
      .filter((e) => e.eventType === "exposed" || e.eventType === "removed")
      .sort((a, b) => {
        const dateDiff = new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime();
        return dateDiff !== 0 ? dateDiff : b.id - a.id;
      })[0];

    const hasActiveExposure = latestRelevantEvent?.eventType === "exposed";

    const exposedEvents = events
      .filter((e) => e.eventType === "exposed")
      .sort((a, b) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime());
    const removedEvents = events
      .filter((e) => e.eventType === "removed")
      .sort((a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime());

    const firstExposedDate = exposedEvents[0]?.eventDate ?? null;
    const lastRemovedDate = removedEvents[0]?.eventDate ?? null;

    let exposedDays: number | null = null;
    if (hasActiveExposure) {
      // Find the most recent "exposed" event (the one that started the current exposure run)
      const currentExposedEvent = exposedEvents[exposedEvents.length - 1];
      if (currentExposedEvent) {
        exposedDays = Math.floor((now - new Date(currentExposedEvent.eventDate).getTime()) / (1000 * 60 * 60 * 24));
      }
    } else if (firstExposedDate && lastRemovedDate) {
      // Was exposed but has since been removed — compute window from first exposed to last removed
      exposedDays = Math.floor(
        (new Date(lastRemovedDate).getTime() - new Date(firstExposedDate).getTime()) / (1000 * 60 * 60 * 24)
      );
    }

    const coverCount = events.filter((e) => e.eventType === "cover").length;
    const hasExposureEvents = events.some((e) => e.eventType === "exposed");

    return {
      ...row.breedings,
      doe: row.goats,
      kids: kidsByBreeding[row.breedings.id] ?? [],
      hasActiveExposure,
      exposedDays,
      coverCount,
      hasExposureEvents,
      firstExposedDate,
      lastRemovedDate,
    };
  });

  res.json(result);
});

// Export all breeding records for the farm as a CSV download. Read-only, so any
// authenticated farm member (including Farm Hands) may export. Defined before
// `/breedings/:id` so "export" is never parsed as a breeding id.
router.get("/breedings/export", async (req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(breedingsTable)
    .leftJoin(goatsTable, eq(breedingsTable.doeId, goatsTable.id))
    .where(eq(breedingsTable.farmId, farmId(req)))
    .orderBy(desc(breedingsTable.breedingDate));

  const headers = [
    "id",
    "doeName",
    "sireName",
    "breedingMethod",
    "breedingDate",
    "expectedKiddingDate",
    "status",
    "notes",
    "createdAt",
  ];

  const data = rows.map((r) => [
    r.breedings.id,
    r.goats?.name ?? "",
    r.breedings.sireName,
    r.breedings.breedingMethod,
    r.breedings.breedingDate,
    r.breedings.expectedKiddingDate,
    r.breedings.status,
    r.breedings.notes,
    r.breedings.createdAt,
  ]);

  sendCsv(res, `${req.farm!.slug}-breedings`, headers, data);
});

// Export all kid (kidding outcome) records for the farm as a CSV download,
// joined to their breeding for the doe's name. Read-only.
router.get("/breedings/kids/export", async (req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(kidsTable)
    .leftJoin(breedingsTable, eq(kidsTable.breedingId, breedingsTable.id))
    .leftJoin(goatsTable, eq(breedingsTable.doeId, goatsTable.id))
    .where(eq(kidsTable.farmId, farmId(req)))
    .orderBy(desc(kidsTable.createdAt));

  const headers = [
    "id",
    "breedingId",
    "doeName",
    "name",
    "sex",
    "kidStatus",
    "birthDate",
    "birthWeight",
    "notes",
    "createdAt",
  ];

  const data = rows.map((r) => [
    r.kids.id,
    r.kids.breedingId,
    r.goats?.name ?? "",
    r.kids.name,
    r.kids.sex,
    r.kids.kidStatus,
    r.kids.birthDate,
    r.kids.birthWeight,
    r.kids.notes,
    r.kids.createdAt,
  ]);

  sendCsv(res, `${req.farm!.slug}-kids`, headers, data);
});

router.post("/breedings", async (req, res): Promise<void> => {
  const parsed = CreateBreedingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const doe = await db
    .select()
    .from(goatsTable)
    .where(and(eq(goatsTable.id, parsed.data.doeId), eq(goatsTable.farmId, farmId(req))));
  if (!doe.length) {
    res.status(404).json({ error: "Doe not found" });
    return;
  }

  const initialStatus = parsed.data.status ?? "bred";
  const breedingMethod = parsed.data.breedingMethod ?? "natural";

  // If drawing from semen inventory, verify the straw exists and has stock before recording.
  let drawStraw: typeof semenStrawsTable.$inferSelect | undefined;
  if (parsed.data.semenStrawId != null) {
    [drawStraw] = await db
      .select()
      .from(semenStrawsTable)
      .where(and(eq(semenStrawsTable.id, parsed.data.semenStrawId), eq(semenStrawsTable.farmId, farmId(req))));
    if (!drawStraw) {
      res.status(404).json({ error: "Semen straw not found" });
      return;
    }
    if (drawStraw.count <= 0) {
      res.status(400).json({ error: "No straws remaining for this inventory entry" });
      return;
    }
  }

  const [breeding] = await db
    .insert(breedingsTable)
    .values({
      farmId: farmId(req),
      doeId: parsed.data.doeId,
      sireName: parsed.data.sireName,
      breedingMethod,
      semenSource: parsed.data.semenSource,
      semenStrawId: drawStraw?.id ?? null,
      breedingDate: new Date(parsed.data.breedingDate),
      expectedKiddingDate: parsed.data.expectedKiddingDate ? new Date(parsed.data.expectedKiddingDate) : null,
      notes: parsed.data.notes,
      status: initialStatus,
    })
    .returning();

  // Natural service starts with the doe exposed to the buck. AI has no exposure —
  // the breeding date is the insemination, so the doe is already serviced.
  await db
    .update(goatsTable)
    .set({ lactationStatus: breedingMethod === "ai" ? "serviced" : "exposed", updatedAt: new Date() })
    .where(and(eq(goatsTable.id, parsed.data.doeId), eq(goatsTable.farmId, farmId(req))));

  // Decrement the drawn straw from inventory (one straw per insemination).
  if (drawStraw) {
    await db
      .update(semenStrawsTable)
      .set({ count: drawStraw.count - 1, updatedAt: new Date() })
      .where(and(eq(semenStrawsTable.id, drawStraw.id), eq(semenStrawsTable.farmId, farmId(req))));
  }

  res.status(201).json(breeding);
});

// Bulk import breeding records from a spreadsheet. Each row's doe is matched to
// an existing goat in the farm by name (case-insensitive); rows whose doe can't
// be matched are skipped with a clear error. Insert-only — never updates
// existing breedings. Farm Hands may import (same as the create flow).
router.post("/breedings/import", async (req, res): Promise<void> => {
  const parsed = ImportBreedingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Build a name → goat lookup for this farm (lowercased, trimmed).
  const farmGoats = await db
    .select()
    .from(goatsTable)
    .where(eq(goatsTable.farmId, farmId(req)));
  const goatByName = new Map<string, typeof farmGoats[number]>();
  for (const g of farmGoats) {
    goatByName.set(g.name.trim().toLowerCase(), g);
  }

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (let i = 0; i < parsed.data.breedings.length; i++) {
    const row = parsed.data.breedings[i];
    const doe = goatByName.get(row.doeName.trim().toLowerCase());
    if (!doe) {
      skipped++;
      errors.push(`Row ${i + 1}: doe "${row.doeName}" not found in the herd — skipped`);
      continue;
    }

    try {
      const status = row.status ?? "bred";
      const breedingMethod = row.breedingMethod ?? "natural";

      await db.insert(breedingsTable).values({
        farmId: farmId(req),
        doeId: doe.id,
        sireName: row.sireName?.trim() || "Unknown",
        breedingMethod,
        breedingDate: row.breedingDate,
        expectedKiddingDate: row.expectedKiddingDate ?? null,
        notes: row.notes ?? null,
        status,
      });

      // Keep the doe's lactation status consistent with the create/kidding flows.
      let lactationStatus: "exposed" | "serviced" | "pregnant" | "milking" | null = null;
      if (status === "bred") lactationStatus = breedingMethod === "ai" ? "serviced" : "exposed";
      else if (status === "confirmed-pregnant") lactationStatus = "pregnant";
      else if (status === "kidded") lactationStatus = "milking";

      if (lactationStatus) {
        await db
          .update(goatsTable)
          .set({ lactationStatus, updatedAt: new Date() })
          .where(and(eq(goatsTable.id, doe.id), eq(goatsTable.farmId, farmId(req))));
      }

      imported++;
    } catch (err) {
      skipped++;
      errors.push(`Row ${i + 1} (${row.doeName}): ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }

  res.status(201).json({ imported, skipped, errors });
});

// Bulk import kidding outcomes. Each kid is tied to a breeding by matching the
// doe's name + the breeding date (same calendar day). When several breedings
// match, the most recent one is used. Rows that can't be matched are skipped.
// Insert-only; does not create herd goat records (historical import).
router.post("/kids/import", async (req, res): Promise<void> => {
  const parsed = ImportKidsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Load all breedings joined to their doe so we can match by doe name + date.
  // Order most-recent-first so the first same-day match is the newest breeding.
  // Tie-break on createdAt then id so "most recent" is deterministic when
  // several breedings share the same breedingDate.
  const breedingRows = await db
    .select()
    .from(breedingsTable)
    .leftJoin(goatsTable, eq(breedingsTable.doeId, goatsTable.id))
    .where(eq(breedingsTable.farmId, farmId(req)))
    .orderBy(
      desc(breedingsTable.breedingDate),
      desc(breedingsTable.createdAt),
      desc(breedingsTable.id),
    );

  const sameDay = (a: Date, b: Date): boolean =>
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate();

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (let i = 0; i < parsed.data.kids.length; i++) {
    const row = parsed.data.kids[i];
    const doeName = row.doeName.trim().toLowerCase();

    // breedingRows are ordered most-recent-first, so the first match is newest.
    const match = breedingRows.find(
      (r) =>
        (r.goats?.name.trim().toLowerCase() ?? "") === doeName &&
        sameDay(new Date(r.breedings.breedingDate), row.breedingDate),
    );

    if (!match) {
      skipped++;
      errors.push(
        `Row ${i + 1}: no breeding found for doe "${row.doeName}" on ${row.breedingDate.toISOString().slice(0, 10)} — skipped`,
      );
      continue;
    }

    try {
      await db.insert(kidsTable).values({
        farmId: farmId(req),
        breedingId: match.breedings.id,
        name: row.name?.trim() || null,
        sex: row.sex,
        kidStatus: row.kidStatus ?? "alive",
        birthDate: row.birthDate ?? null,
        birthWeight: row.birthWeight ?? null,
        notes: row.notes ?? null,
      });
      imported++;
    } catch (err) {
      skipped++;
      errors.push(`Row ${i + 1} (${row.doeName}): ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }

  res.status(201).json({ imported, skipped, errors });
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
    .where(and(eq(breedingsTable.id, id), eq(breedingsTable.farmId, farmId(req))));

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

  const pregnancyTests = await db
    .select()
    .from(pregnancyTestsTable)
    .where(and(eq(pregnancyTestsTable.breedingId, id), eq(pregnancyTestsTable.farmId, farmId(req))))
    .orderBy(asc(pregnancyTestsTable.testDate));

  res.json({
    ...rows[0].breedings,
    doe: rows[0].goats,
    kids,
    events,
    pregnancyTests,
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

  const [existing] = await db
    .select()
    .from(breedingsTable)
    .where(and(eq(breedingsTable.id, id), eq(breedingsTable.farmId, farmId(req))));

  if (!existing) {
    res.status(404).json({ error: "Breeding not found" });
    return;
  }

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.sireName !== undefined) updateData.sireName = parsed.data.sireName;
  if (parsed.data.breedingMethod !== undefined) updateData.breedingMethod = parsed.data.breedingMethod;
  if (parsed.data.semenSource !== undefined) updateData.semenSource = parsed.data.semenSource;
  if (parsed.data.breedingDate !== undefined) updateData.breedingDate = new Date(parsed.data.breedingDate);
  if (parsed.data.expectedKiddingDate !== undefined) updateData.expectedKiddingDate = new Date(parsed.data.expectedKiddingDate);
  if (parsed.data.status !== undefined) updateData.status = parsed.data.status;
  if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes;

  const [breeding] = await db
    .update(breedingsTable)
    .set(updateData)
    .where(and(eq(breedingsTable.id, id), eq(breedingsTable.farmId, farmId(req))))
    .returning();

  if (!breeding) {
    res.status(404).json({ error: "Breeding not found" });
    return;
  }

  if (parsed.data.status === "open") {
    const doe = await db
      .select()
      .from(goatsTable)
      .where(and(eq(goatsTable.id, breeding.doeId), eq(goatsTable.farmId, farmId(req))));
    if (doe.length && doe[0].lactationStatus === "pregnant") {
      await db
        .update(goatsTable)
        .set({ lactationStatus: "dry", updatedAt: new Date() })
        .where(and(eq(goatsTable.id, breeding.doeId), eq(goatsTable.farmId, farmId(req))));
    }
  }

  if (parsed.data.status === "confirmed-pregnant" && existing.status !== "confirmed-pregnant") {
    await db
      .update(goatsTable)
      .set({ lactationStatus: "pregnant", updatedAt: new Date() })
      .where(and(eq(goatsTable.id, breeding.doeId), eq(goatsTable.farmId, farmId(req))));
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
    .where(and(eq(breedingsTable.id, breedingId), eq(breedingsTable.farmId, farmId(req))));

  if (!breedingRows.length) {
    res.status(404).json({ error: "Breeding not found" });
    return;
  }

  const breeding = breedingRows[0].breedings;
  const doe = breedingRows[0].goats;

  // For AI breedings drawn from inventory, inherit the sire's breeding line from
  // the linked semen straw so kids carry paternal grandparents (mirrors maternal
  // inheritance from the doe). Only the straw actually used for this breeding is
  // consulted — natural service and AI breedings with no linked straw leave
  // paternal grandparents blank.
  let sireStraw: typeof semenStrawsTable.$inferSelect | undefined;
  if (breeding.breedingMethod === "ai" && breeding.semenStrawId != null) {
    [sireStraw] = await db
      .select()
      .from(semenStrawsTable)
      .where(and(eq(semenStrawsTable.id, breeding.semenStrawId), eq(semenStrawsTable.farmId, farmId(req))));
  }

  const birthDate = parsed.data.birthDate ? new Date(parsed.data.birthDate) : null;

  // Insert kid records first (without goatId)
  const kidRows = parsed.data.kids.map((kid) => ({
    farmId: farmId(req),
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
        farmId: farmId(req),
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
        // Paternal grands = sire's parents, inherited from the semen straw (AI only)
        paternalGranddamName: sireStraw?.sireDamName ?? "",
        paternalGrandsireName: sireStraw?.sireSireName ?? "",
      })
      .returning();

    // Link the kid record back to the new goat
    await db
      .update(kidsTable)
      .set({ goatId: newGoat.id })
      .where(and(eq(kidsTable.id, kid.id), eq(kidsTable.farmId, farmId(req))));
  }

  // Mark breeding as kidded and update doe's lactation status
  await db
    .update(breedingsTable)
    .set({ status: "kidded", updatedAt: new Date() })
    .where(and(eq(breedingsTable.id, breedingId), eq(breedingsTable.farmId, farmId(req))));

  await db
    .update(goatsTable)
    .set({ lactationStatus: "milking", updatedAt: new Date() })
    .where(and(eq(goatsTable.id, breeding.doeId), eq(goatsTable.farmId, farmId(req))));

  // Return kids with goatId populated
  const finalKids = await db
    .select()
    .from(kidsTable)
    .where(and(eq(kidsTable.breedingId, breedingId), eq(kidsTable.farmId, farmId(req))));
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

  const [existing] = await db
    .select()
    .from(kidsTable)
    .where(and(eq(kidsTable.id, paramsParsed.data.kidId), eq(kidsTable.farmId, farmId(req))));
  if (!existing || existing.breedingId !== paramsParsed.data.id) {
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

  const [updated] = await db
    .update(kidsTable)
    .set(updateData)
    .where(and(eq(kidsTable.id, paramsParsed.data.kidId), eq(kidsTable.farmId, farmId(req))))
    .returning();

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
      await db
        .update(goatsTable)
        .set(goatUpdate)
        .where(and(eq(goatsTable.id, updated.goatId), eq(goatsTable.farmId, farmId(req))));
    }
  }

  res.json(updated);
});

router.delete("/breedings/:id/kids/:kidId", requireManager, async (req, res): Promise<void> => {
  const paramsParsed = DeleteKidParams.safeParse({ id: Number(req.params.id), kidId: Number(req.params.kidId) });
  if (!paramsParsed.success) {
    res.status(400).json({ error: "Invalid IDs" });
    return;
  }

  const [kid] = await db
    .select()
    .from(kidsTable)
    .where(and(eq(kidsTable.id, paramsParsed.data.kidId), eq(kidsTable.farmId, farmId(req))));
  if (!kid || kid.breedingId !== paramsParsed.data.id) {
    res.status(404).json({ error: "Kid not found" });
    return;
  }

  await db
    .delete(kidsTable)
    .where(and(eq(kidsTable.id, paramsParsed.data.kidId), eq(kidsTable.farmId, farmId(req))));

  res.status(204).send();
});

// Record a pregnancy test against a breeding. Farm Hands may log tests (like
// breedings/kiddings/events). In a single transaction the test is inserted and,
// depending on the flags, the breeding + doe are transitioned:
//  - confirmPregnancy: breeding -> confirmed-pregnant, doe -> pregnant
//  - markOpen: breeding -> open, doe -> dry
//  - addCoverEvent: a final "cover" breeding event is logged before closing out
// Returns the updated breeding detail (with doe, kids, events, and all tests).
router.post("/breedings/:id/pregnancy-tests", async (req, res): Promise<void> => {
  const idParsed = CreatePregnancyTestParams.safeParse({ id: Number(req.params.id) });
  if (!idParsed.success) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const breedingId = idParsed.data.id;

  const parsed = CreatePregnancyTestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [breeding] = await db
    .select()
    .from(breedingsTable)
    .where(and(eq(breedingsTable.id, breedingId), eq(breedingsTable.farmId, farmId(req))));
  if (!breeding) {
    res.status(404).json({ error: "Breeding not found" });
    return;
  }

  const data = parsed.data;

  await db.transaction(async (tx) => {
    await tx.insert(pregnancyTestsTable).values({
      farmId: farmId(req),
      breedingId,
      testDate: new Date(data.testDate),
      method: data.method,
      result: data.result,
      testedBy: data.testedBy ?? null,
      notes: data.notes ?? null,
    });

    // Optional final cover before closing out a negative cycle.
    if (data.addCoverEvent) {
      await tx.insert(breedingEventsTable).values({
        farmId: farmId(req),
        breedingId,
        eventType: "cover",
        eventDate: new Date(data.addCoverEvent.eventDate),
        notes: data.addCoverEvent.notes ?? null,
      });
    }

    // Positive result shortcut: confirm the pregnancy.
    if (data.confirmPregnancy) {
      await tx
        .update(breedingsTable)
        .set({ status: "confirmed-pregnant", updatedAt: new Date() })
        .where(and(eq(breedingsTable.id, breedingId), eq(breedingsTable.farmId, farmId(req))));
      await tx
        .update(goatsTable)
        .set({ lactationStatus: "pregnant", updatedAt: new Date() })
        .where(and(eq(goatsTable.id, breeding.doeId), eq(goatsTable.farmId, farmId(req))));
    }

    // Negative result: mark the doe open and dry (removes her from active list).
    if (data.markOpen) {
      await tx
        .update(breedingsTable)
        .set({ status: "open", updatedAt: new Date() })
        .where(and(eq(breedingsTable.id, breedingId), eq(breedingsTable.farmId, farmId(req))));
      await tx
        .update(goatsTable)
        .set({ lactationStatus: "dry", updatedAt: new Date() })
        .where(and(eq(goatsTable.id, breeding.doeId), eq(goatsTable.farmId, farmId(req))));
    }
  });

  // Return the fresh breeding detail (mirrors GET /breedings/:id).
  const rows = await db
    .select()
    .from(breedingsTable)
    .leftJoin(goatsTable, eq(breedingsTable.doeId, goatsTable.id))
    .where(and(eq(breedingsTable.id, breedingId), eq(breedingsTable.farmId, farmId(req))));

  const kids = await db
    .select()
    .from(kidsTable)
    .where(eq(kidsTable.breedingId, breedingId))
    .orderBy(kidsTable.createdAt);

  const events = await db
    .select()
    .from(breedingEventsTable)
    .where(eq(breedingEventsTable.breedingId, breedingId))
    .orderBy(asc(breedingEventsTable.eventDate));

  const pregnancyTests = await db
    .select()
    .from(pregnancyTestsTable)
    .where(and(eq(pregnancyTestsTable.breedingId, breedingId), eq(pregnancyTestsTable.farmId, farmId(req))))
    .orderBy(asc(pregnancyTestsTable.testDate));

  res.status(201).json({
    ...rows[0].breedings,
    doe: rows[0].goats,
    kids,
    events,
    pregnancyTests,
  });
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

  const [breeding] = await db
    .select()
    .from(breedingsTable)
    .where(and(eq(breedingsTable.id, idParsed.data.id), eq(breedingsTable.farmId, farmId(req))));
  if (!breeding) {
    res.status(404).json({ error: "Breeding not found" });
    return;
  }

  const [event] = await db
    .insert(breedingEventsTable)
    .values({
      farmId: farmId(req),
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
        .where(and(eq(breedingsTable.id, idParsed.data.id), eq(breedingsTable.farmId, farmId(req))));
    }

    await db
      .update(goatsTable)
      .set({ lactationStatus: "serviced", updatedAt: new Date() })
      .where(and(eq(goatsTable.id, breeding.doeId), eq(goatsTable.farmId, farmId(req))));
  }

  res.status(201).json(event);
});

router.put("/breedings/:id/events/:eventId", async (req, res): Promise<void> => {
  const paramsParsed = UpdateBreedingEventParams.safeParse({
    id: Number(req.params.id),
    eventId: Number(req.params.eventId),
  });
  if (!paramsParsed.success) {
    res.status(400).json({ error: "Invalid IDs" });
    return;
  }

  const parsed = UpdateBreedingEventBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(breedingEventsTable)
    .where(and(eq(breedingEventsTable.id, paramsParsed.data.eventId), eq(breedingEventsTable.farmId, farmId(req))));

  if (!existing || existing.breedingId !== paramsParsed.data.id) {
    res.status(404).json({ error: "Event not found" });
    return;
  }

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.eventDate !== undefined) updateData.eventDate = new Date(parsed.data.eventDate);
  if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes || null;

  const [updated] = await db
    .update(breedingEventsTable)
    .set(updateData)
    .where(and(eq(breedingEventsTable.id, paramsParsed.data.eventId), eq(breedingEventsTable.farmId, farmId(req))))
    .returning();

  // If a cover event's date changed, recalculate expectedKiddingDate from the latest cover
  if (existing.eventType === "cover" && parsed.data.eventDate !== undefined) {
    const allEvents = await db
      .select()
      .from(breedingEventsTable)
      .where(eq(breedingEventsTable.breedingId, paramsParsed.data.id));
    const covers = allEvents
      .filter((e) => e.eventType === "cover")
      .sort((a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime());
    if (covers.length > 0) {
      const latestCover = new Date(covers[0].eventDate);
      const newKiddingDate = new Date(latestCover.getTime() + 145 * 24 * 60 * 60 * 1000);
      await db
        .update(breedingsTable)
        .set({ expectedKiddingDate: newKiddingDate, updatedAt: new Date() })
        .where(and(eq(breedingsTable.id, paramsParsed.data.id), eq(breedingsTable.farmId, farmId(req))));
    }
  }

  res.json(updated);
});

router.delete("/breedings/:id/events/:eventId", requireManager, async (req, res): Promise<void> => {
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
    .where(and(eq(breedingEventsTable.id, paramsParsed.data.eventId), eq(breedingEventsTable.farmId, farmId(req))));

  if (!event || event.breedingId !== paramsParsed.data.id) {
    res.status(404).json({ error: "Event not found" });
    return;
  }

  await db
    .delete(breedingEventsTable)
    .where(and(eq(breedingEventsTable.id, paramsParsed.data.eventId), eq(breedingEventsTable.farmId, farmId(req))));

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
        .where(and(eq(breedingsTable.id, paramsParsed.data.id), eq(breedingsTable.farmId, farmId(req))));
    }
    // If no covers remain, leave expectedKiddingDate as-is (preserve manually entered value)
  }

  res.status(204).send();
});

router.delete("/breedings/:id", requireManager, async (req, res): Promise<void> => {
  const idParsed = DeleteBreedingParams.safeParse({ id: Number(req.params.id) });
  if (!idParsed.success) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const { id } = idParsed.data;

  const [breeding] = await db
    .select()
    .from(breedingsTable)
    .where(and(eq(breedingsTable.id, id), eq(breedingsTable.farmId, farmId(req))));
  if (!breeding) {
    res.status(404).json({ error: "Breeding not found" });
    return;
  }

  await db.delete(kidsTable).where(and(eq(kidsTable.breedingId, id), eq(kidsTable.farmId, farmId(req))));
  await db
    .delete(breedingEventsTable)
    .where(and(eq(breedingEventsTable.breedingId, id), eq(breedingEventsTable.farmId, farmId(req))));
  await db.delete(breedingsTable).where(and(eq(breedingsTable.id, id), eq(breedingsTable.farmId, farmId(req))));

  res.status(204).send();
});

export default router;
