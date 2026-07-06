import { Router, type IRouter } from "express";
import { and, desc, eq, inArray, isNull, notInArray, or } from "drizzle-orm";
import { db, goatsTable, healthEventsTable } from "@workspace/db";
import { CreateGoatHealthEventBody, CreateHealthEventsBulkBody } from "@workspace/api-zod";
import { requireRole } from "../middlewares/auth";
import { farmId } from "../middlewares/tenant";

const router: IRouter = Router();

// Farmhands log health events during herd work, so creation is open to any
// authenticated farm member. Deleting a record is Admin/Owner only.
const requireManager = requireRole("admin", "owner");

// Herd statuses that are never worked on a herd work day.
const EXCLUDED_HERD_STATUSES = ["dead", "sold-registered", "sold-not-registered", "retired"] as const;

/** Returns the goat only if it belongs to the request's farm; otherwise null. */
async function findFarmGoat(req: Parameters<typeof farmId>[0], goatId: number) {
  if (!Number.isInteger(goatId)) return null;
  const [goat] = await db
    .select()
    .from(goatsTable)
    .where(and(eq(goatsTable.id, goatId), eq(goatsTable.farmId, farmId(req))))
    .limit(1);
  return goat ?? null;
}

// GET /goats/:id/health-events — a goat's health history, newest first.
router.get("/goats/:id/health-events", async (req, res): Promise<void> => {
  const goat = await findFarmGoat(req, Number(req.params.id));
  if (!goat) {
    res.status(404).json({ error: "Goat not found" });
    return;
  }

  const events = await db
    .select()
    .from(healthEventsTable)
    .where(and(eq(healthEventsTable.goatId, goat.id), eq(healthEventsTable.farmId, farmId(req))))
    .orderBy(desc(healthEventsTable.eventDate), desc(healthEventsTable.id));
  res.json(events);
});

// POST /goats/:id/health-events — record an ad hoc health event (any member).
router.post("/goats/:id/health-events", async (req, res): Promise<void> => {
  const goat = await findFarmGoat(req, Number(req.params.id));
  if (!goat) {
    res.status(404).json({ error: "Goat not found" });
    return;
  }

  const parsed = CreateGoatHealthEventBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { eventType, eventDate, famachaScore, dosageMl, bodyWeight, productName, notes } =
    parsed.data;
  const [created] = await db
    .insert(healthEventsTable)
    .values({
      farmId: farmId(req),
      goatId: goat.id,
      eventType,
      eventDate: new Date(eventDate),
      famachaScore: eventType === "famacha" || eventType === "deworming" ? famachaScore ?? null : null,
      dosageMl: dosageMl ?? null,
      bodyWeight: bodyWeight ?? null,
      productName: productName?.trim() || null,
      notes: notes?.trim() || null,
    })
    .returning();
  res.status(201).json(created);
});

// DELETE /goats/:id/health-events/:eventId — Admin/Owner only.
router.delete(
  "/goats/:id/health-events/:eventId",
  requireManager,
  async (req, res): Promise<void> => {
    const goat = await findFarmGoat(req, Number(req.params.id));
    const eventId = Number(req.params.eventId);
    if (!goat || !Number.isInteger(eventId)) {
      res.status(404).json({ error: "Health event not found" });
      return;
    }

    const deleted = await db
      .delete(healthEventsTable)
      .where(
        and(
          eq(healthEventsTable.id, eventId),
          eq(healthEventsTable.goatId, goat.id),
          eq(healthEventsTable.farmId, farmId(req)),
        ),
      )
      .returning();
    if (deleted.length === 0) {
      res.status(404).json({ error: "Health event not found" });
      return;
    }
    res.status(204).end();
  },
);

// GET /health-events/bulk-session — goats eligible for a herd work day.
router.get("/health-events/bulk-session", async (req, res): Promise<void> => {
  const goats = await db
    .select()
    .from(goatsTable)
    .where(
      and(
        eq(goatsTable.farmId, farmId(req)),
        or(
          isNull(goatsTable.herdStatus),
          notInArray(goatsTable.herdStatus, [...EXCLUDED_HERD_STATUSES]),
        ),
      ),
    )
    .orderBy(goatsTable.name);
  res.json(goats);
});

// POST /health-events/bulk — record a herd work day batch (any member).
router.post("/health-events/bulk", async (req, res): Promise<void> => {
  const parsed = CreateHealthEventsBulkBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { eventDate, events } = parsed.data;
  const fid = farmId(req);

  // Every goat in the batch must belong to this farm; otherwise reject the
  // whole batch so a partial write never happens.
  const goatIds = Array.from(new Set(events.map((e) => e.goatId)));
  const farmGoats = await db
    .select({ id: goatsTable.id })
    .from(goatsTable)
    .where(and(eq(goatsTable.farmId, fid), inArray(goatsTable.id, goatIds)));
  if (farmGoats.length !== goatIds.length) {
    res.status(404).json({ error: "One or more goats were not found in this farm" });
    return;
  }

  const date = new Date(eventDate);
  const rows = events.map((e) => ({
    farmId: fid,
    goatId: e.goatId,
    eventType: e.eventType,
    eventDate: date,
    famachaScore:
      e.eventType === "famacha" || e.eventType === "deworming" ? e.famachaScore ?? null : null,
    dosageMl: e.dosageMl ?? null,
    bodyWeight: e.bodyWeight ?? null,
    productName: e.productName?.trim() || null,
    notes: e.notes?.trim() || null,
  }));
  const created = await db.insert(healthEventsTable).values(rows).returning();
  res.status(201).json({ created: created.length });
});

export default router;
