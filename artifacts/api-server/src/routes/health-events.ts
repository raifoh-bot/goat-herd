import { Router, type IRouter } from "express";
import { and, desc, eq, inArray, isNull, notInArray, or } from "drizzle-orm";
import { db, farmSettingsTable, goatsTable, healthEventsTable } from "@workspace/db";
import type { SchedulableEventType } from "@workspace/db";
import {
  CreateGoatHealthEventBody,
  CreateHealthEventsBulkBody,
  UpdateGoatHealthEventBody,
} from "@workspace/api-zod";
import { requireRole } from "../middlewares/auth";
import { farmId } from "../middlewares/tenant";
import { SCHEDULABLE_EVENT_TYPES, normalizeHealthScheduleIntervals } from "../lib/healthSchedules";

const router: IRouter = Router();

// Farmhands log health events during herd work, so creation is open to any
// authenticated farm member. Deleting a record is Admin/Owner only.
const requireManager = requireRole("admin", "owner");

// Herd statuses that are never worked on a herd work day.
const EXCLUDED_HERD_STATUSES = ["dead", "sold-registered", "sold-not-registered"] as const;

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

// PUT /goats/:id/health-events/:eventId — fix a transcription mistake (any
// member, matching creation: farmhands enter events and must be able to
// correct their own typos). Omitted fields stay as-is; nullable fields are
// cleared by sending null.
router.put("/goats/:id/health-events/:eventId", async (req, res): Promise<void> => {
  const goat = await findFarmGoat(req, Number(req.params.id));
  const eventId = Number(req.params.eventId);
  if (!goat || !Number.isInteger(eventId)) {
    res.status(404).json({ error: "Health event not found" });
    return;
  }

  const parsed = UpdateGoatHealthEventBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(healthEventsTable)
    .where(
      and(
        eq(healthEventsTable.id, eventId),
        eq(healthEventsTable.goatId, goat.id),
        eq(healthEventsTable.farmId, farmId(req)),
      ),
    )
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "Health event not found" });
    return;
  }

  const body = parsed.data;
  const set: Partial<typeof healthEventsTable.$inferInsert> = {};
  if (body.eventType !== undefined) set.eventType = body.eventType;
  if (body.eventDate !== undefined) set.eventDate = new Date(body.eventDate);
  if (body.famachaScore !== undefined) set.famachaScore = body.famachaScore;
  if (body.dosageMl !== undefined) set.dosageMl = body.dosageMl;
  if (body.bodyWeight !== undefined) set.bodyWeight = body.bodyWeight;
  if (body.productName !== undefined) set.productName = body.productName?.trim() || null;
  if (body.notes !== undefined) set.notes = body.notes?.trim() || null;

  // FAMACHA scores only make sense on famacha/deworming events — keep the
  // same invariant the create paths enforce, based on the resulting type.
  const nextType = set.eventType ?? existing.eventType;
  if (nextType !== "famacha" && nextType !== "deworming") {
    set.famachaScore = null;
  }

  if (Object.keys(set).length === 0) {
    res.json(existing);
    return;
  }

  const [updated] = await db
    .update(healthEventsTable)
    .set(set)
    .where(eq(healthEventsTable.id, existing.id))
    .returning();
  res.json(updated);
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

// How far ahead of a due date the app starts flagging work as "due-soon".
const DUE_SOON_WINDOW_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

// GET /health-events/due — goats with routine health work due or overdue,
// based on the farm's configured per-event-type intervals. Returns nothing
// due when no intervals are set.
router.get("/health-events/due", async (req, res): Promise<void> => {
  const fid = farmId(req);

  const [settings] = await db
    .select({ intervals: farmSettingsTable.healthScheduleIntervals })
    .from(farmSettingsTable)
    .where(eq(farmSettingsTable.farmId, fid))
    .limit(1);
  const intervals = normalizeHealthScheduleIntervals(settings?.intervals);
  const activeTypes = SCHEDULABLE_EVENT_TYPES.filter(
    (type) => typeof intervals[type] === "number",
  );

  if (activeTypes.length === 0) {
    res.json({ intervals, goats: [] });
    return;
  }

  // Only on-farm goats appear in the Health Work Due widget — leased-out or
  // otherwise off-farm goats aren't the farmer's routine-care responsibility.
  // A null herdStatus is treated as on-farm.
  const goats = await db
    .select()
    .from(goatsTable)
    .where(
      and(
        eq(goatsTable.farmId, fid),
        or(
          isNull(goatsTable.herdStatus),
          eq(goatsTable.herdStatus, "on-farm"),
          eq(goatsTable.herdStatus, "on-farm-boarding"),
        ),
      ),
    )
    .orderBy(goatsTable.name);

  if (goats.length === 0) {
    res.json({ intervals, goats: [] });
    return;
  }

  // Latest event date per (goat, event type), restricted to the scheduled types.
  const goatIds = goats.map((g) => g.id);
  const events = await db
    .select({
      goatId: healthEventsTable.goatId,
      eventType: healthEventsTable.eventType,
      eventDate: healthEventsTable.eventDate,
    })
    .from(healthEventsTable)
    .where(
      and(
        eq(healthEventsTable.farmId, fid),
        inArray(healthEventsTable.goatId, goatIds),
        inArray(healthEventsTable.eventType, [...activeTypes]),
      ),
    );

  // goatId -> eventType -> most recent event date
  const lastByGoat = new Map<number, Map<string, Date>>();
  for (const ev of events) {
    let perType = lastByGoat.get(ev.goatId);
    if (!perType) {
      perType = new Map();
      lastByGoat.set(ev.goatId, perType);
    }
    const prev = perType.get(ev.eventType);
    if (!prev || ev.eventDate > prev) perType.set(ev.eventType, ev.eventDate);
  }

  const now = Date.now();
  const dueGoats = [];
  for (const goat of goats) {
    const perType = lastByGoat.get(goat.id);
    const items = [];
    for (const type of activeTypes) {
      const intervalDays = intervals[type] as number;
      const last = perType?.get(type) ?? null;
      if (!last) {
        items.push({
          eventType: type as SchedulableEventType,
          status: "never" as const,
          intervalDays,
          lastEventDate: null,
          dueDate: null,
          daysOverdue: 0,
        });
        continue;
      }
      const dueMs = last.getTime() + intervalDays * DAY_MS;
      if (now >= dueMs) {
        items.push({
          eventType: type as SchedulableEventType,
          status: "overdue" as const,
          intervalDays,
          lastEventDate: last.toISOString(),
          dueDate: new Date(dueMs).toISOString(),
          daysOverdue: Math.floor((now - dueMs) / DAY_MS),
        });
      } else if (dueMs - now <= DUE_SOON_WINDOW_DAYS * DAY_MS) {
        items.push({
          eventType: type as SchedulableEventType,
          status: "due-soon" as const,
          intervalDays,
          lastEventDate: last.toISOString(),
          dueDate: new Date(dueMs).toISOString(),
          daysOverdue: 0,
        });
      }
    }
    if (items.length > 0) dueGoats.push({ goat, items });
  }

  res.json({ intervals, goats: dueGoats });
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
