import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import request, { type Agent } from "supertest";
import { eq } from "drizzle-orm";
import bcrypt from "bcrypt";
import { db, goatsTable, usersTable, farmsTable, healthEventsTable, farmSettingsTable } from "@workspace/db";
import app from "../app";

// Integration tests for the per-goat health event endpoints and the herd-work-day
// bulk endpoints. They run against the live database; every created row is
// tracked and removed afterwards. Two agents are used: an admin (full access)
// and a farmhand (can create events but not delete them).

const createdGoatIds: number[] = [];
const createdEventIds: number[] = [];

const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const ADMIN_USERNAME = `test-he-admin-${RUN_ID}`;
const FARMHAND_USERNAME = `test-he-hand-${RUN_ID}`;
const TEST_PASSWORD = "test-password-123";
const TEST_FARM_SLUG = "default";

let testFarmId: number;
let otherFarmId: number;
let adminUserId: number;
let farmhandUserId: number;
let adminAgent: Agent;
let farmhandAgent: Agent;

async function createGoat(overrides: Partial<typeof goatsTable.$inferInsert> = {}) {
  const [goat] = await db
    .insert(goatsTable)
    .values({
      farmId: testFarmId,
      name: `Test Goat ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      sex: "doe",
      breed: "alpine",
      ...overrides,
    })
    .returning();
  createdGoatIds.push(goat.id);
  return goat;
}

afterEach(async () => {
  for (const eventId of createdEventIds) {
    await db.delete(healthEventsTable).where(eq(healthEventsTable.id, eventId));
  }
  createdEventIds.length = 0;

  for (const goatId of createdGoatIds) {
    await db.delete(healthEventsTable).where(eq(healthEventsTable.goatId, goatId));
    await db.delete(goatsTable).where(eq(goatsTable.id, goatId));
  }
  createdGoatIds.length = 0;
});

beforeAll(async () => {
  const [defaultFarm] = await db
    .select()
    .from(farmsTable)
    .where(eq(farmsTable.slug, TEST_FARM_SLUG));
  expect(defaultFarm).toBeTruthy();
  testFarmId = defaultFarm.id;

  // A second farm used only to verify cross-farm isolation.
  const [otherFarm] = await db
    .insert(farmsTable)
    .values({ slug: `test-he-farm-${RUN_ID}`, name: "Other Farm" })
    .returning();
  otherFarmId = otherFarm.id;

  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
  const [admin] = await db
    .insert(usersTable)
    .values({ farmId: testFarmId, username: ADMIN_USERNAME, passwordHash, role: "admin", active: true })
    .returning();
  adminUserId = admin.id;
  const [farmhand] = await db
    .insert(usersTable)
    .values({ farmId: testFarmId, username: FARMHAND_USERNAME, passwordHash, role: "farmhand", active: true })
    .returning();
  farmhandUserId = farmhand.id;

  adminAgent = request.agent(app);
  const adminLogin = await adminAgent
    .post("/api/auth/login")
    .set("X-Farm-Slug", TEST_FARM_SLUG)
    .send({ username: ADMIN_USERNAME, password: TEST_PASSWORD });
  expect(adminLogin.status).toBe(200);

  farmhandAgent = request.agent(app);
  const farmhandLogin = await farmhandAgent
    .post("/api/auth/login")
    .set("X-Farm-Slug", TEST_FARM_SLUG)
    .send({ username: FARMHAND_USERNAME, password: TEST_PASSWORD });
  expect(farmhandLogin.status).toBe(200);
});

afterAll(async () => {
  await db.delete(usersTable).where(eq(usersTable.id, adminUserId));
  await db.delete(usersTable).where(eq(usersTable.id, farmhandUserId));
  await db.delete(farmsTable).where(eq(farmsTable.id, otherFarmId));
  const { pool } = await import("@workspace/db");
  await pool.end();
});

describe("POST /api/goats/:id/health-events", () => {
  it("records an ad hoc event and lists it newest first", async () => {
    const goat = await createGoat();

    const older = await adminAgent.post(`/api/goats/${goat.id}/health-events`).send({
      eventType: "hoof_trim",
      eventDate: "2026-06-01T00:00:00.000Z",
    });
    expect(older.status).toBe(201);
    createdEventIds.push(older.body.id);

    const newer = await adminAgent.post(`/api/goats/${goat.id}/health-events`).send({
      eventType: "deworming",
      eventDate: "2026-07-01T00:00:00.000Z",
      productName: "  Cydectin  ",
      dosageMl: 4.5,
      famachaScore: 4,
      notes: "observed pale eyelids",
    });
    expect(newer.status).toBe(201);
    createdEventIds.push(newer.body.id);
    expect(newer.body.productName).toBe("Cydectin");
    expect(newer.body.famachaScore).toBe(4);

    const list = await adminAgent.get(`/api/goats/${goat.id}/health-events`);
    expect(list.status).toBe(200);
    expect(list.body.map((e: { eventType: string }) => e.eventType)).toEqual([
      "deworming",
      "hoof_trim",
    ]);
  });

  it("allows a farmhand to record events", async () => {
    const goat = await createGoat();
    const res = await farmhandAgent.post(`/api/goats/${goat.id}/health-events`).send({
      eventType: "famacha",
      eventDate: "2026-07-01T00:00:00.000Z",
      famachaScore: 2,
    });
    expect(res.status).toBe(201);
    createdEventIds.push(res.body.id);
    expect(res.body.famachaScore).toBe(2);
  });

  it("ignores famachaScore for event types that don't carry one", async () => {
    const goat = await createGoat();
    const res = await adminAgent.post(`/api/goats/${goat.id}/health-events`).send({
      eventType: "cdt_shot",
      eventDate: "2026-07-01T00:00:00.000Z",
      famachaScore: 5,
    });
    expect(res.status).toBe(201);
    createdEventIds.push(res.body.id);
    expect(res.body.famachaScore).toBeNull();
  });

  it("rejects an invalid body", async () => {
    const goat = await createGoat();
    const res = await adminAgent.post(`/api/goats/${goat.id}/health-events`).send({
      eventType: "acupuncture",
      eventDate: "2026-07-01T00:00:00.000Z",
    });
    expect(res.status).toBe(400);
  });

  it("404s for a goat in another farm", async () => {
    const [foreignGoat] = await db
      .insert(goatsTable)
      .values({ farmId: otherFarmId, name: `Foreign ${RUN_ID}`, sex: "doe", breed: "alpine" })
      .returning();
    createdGoatIds.push(foreignGoat.id);

    const res = await adminAgent.post(`/api/goats/${foreignGoat.id}/health-events`).send({
      eventType: "hoof_trim",
      eventDate: "2026-07-01T00:00:00.000Z",
    });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/goats/:id/health-events/:eventId", () => {
  it("lets an admin delete and blocks a farmhand", async () => {
    const goat = await createGoat();
    const created = await adminAgent.post(`/api/goats/${goat.id}/health-events`).send({
      eventType: "copper_bolus",
      eventDate: "2026-07-01T00:00:00.000Z",
    });
    expect(created.status).toBe(201);
    const eventId = created.body.id;

    const farmhandDelete = await farmhandAgent.delete(
      `/api/goats/${goat.id}/health-events/${eventId}`,
    );
    expect(farmhandDelete.status).toBe(403);

    const adminDelete = await adminAgent.delete(`/api/goats/${goat.id}/health-events/${eventId}`);
    expect(adminDelete.status).toBe(204);

    const list = await adminAgent.get(`/api/goats/${goat.id}/health-events`);
    expect(list.body).toHaveLength(0);
  });

  it("404s when the event belongs to a different goat", async () => {
    const goatA = await createGoat();
    const goatB = await createGoat();
    const created = await adminAgent.post(`/api/goats/${goatA.id}/health-events`).send({
      eventType: "hoof_trim",
      eventDate: "2026-07-01T00:00:00.000Z",
    });
    createdEventIds.push(created.body.id);

    const res = await adminAgent.delete(`/api/goats/${goatB.id}/health-events/${created.body.id}`);
    expect(res.status).toBe(404);
  });
});

describe("GET /api/health-events/bulk-session", () => {
  it("excludes dead and sold goats but keeps retired-from-breeding goats", async () => {
    const eligible = await createGoat({ herdStatus: "on-farm" });
    const noStatus = await createGoat();
    const dead = await createGoat({ herdStatus: "dead" });
    const sold = await createGoat({ herdStatus: "sold-not-registered" });
    const soldRegistered = await createGoat({ herdStatus: "sold-registered" });
    const retired = await createGoat({ breedingStatus: "retired" });

    const res = await adminAgent.get("/api/health-events/bulk-session");
    expect(res.status).toBe(200);
    const ids = res.body.map((g: { id: number }) => g.id);
    expect(ids).toContain(eligible.id);
    expect(ids).toContain(noStatus.id);
    expect(ids).not.toContain(dead.id);
    expect(ids).not.toContain(sold.id);
    expect(ids).not.toContain(soldRegistered.id);
    expect(ids).toContain(retired.id);
  });
});

describe("GET /api/health-events/due", () => {
  const DAY_MS = 24 * 60 * 60 * 1000;

  async function addEvent(
    goatId: number,
    eventType: "hoof_trim" | "cdt_shot" | "copper_bolus" | "deworming",
    daysAgo: number,
  ) {
    const [ev] = await db
      .insert(healthEventsTable)
      .values({
        farmId: testFarmId,
        goatId,
        eventType,
        eventDate: new Date(Date.now() - daysAgo * DAY_MS),
      })
      .returning();
    createdEventIds.push(ev.id);
    return ev;
  }

  async function setIntervals(intervals: Record<string, number>) {
    // A read lazily provisions the settings row for the default farm.
    await adminAgent.get("/api/settings");
    await db
      .update(farmSettingsTable)
      .set({ healthScheduleIntervals: intervals })
      .where(eq(farmSettingsTable.farmId, testFarmId));
  }

  afterEach(async () => {
    await db
      .update(farmSettingsTable)
      .set({ healthScheduleIntervals: null })
      .where(eq(farmSettingsTable.farmId, testFarmId));
  });

  it("returns nothing due when no intervals are configured", async () => {
    await setIntervals({});
    await createGoat();
    const res = await adminAgent.get("/api/health-events/due");
    expect(res.status).toBe(200);
    expect(res.body.intervals).toEqual({});
    expect(res.body.goats).toEqual([]);
  });

  it("flags a goat that has never had the scheduled work as 'never'", async () => {
    await setIntervals({ hoof_trim: 56 });
    const goat = await createGoat();

    const res = await adminAgent.get("/api/health-events/due");
    expect(res.status).toBe(200);
    const entry = res.body.goats.find((g: { goat: { id: number } }) => g.goat.id === goat.id);
    expect(entry).toBeTruthy();
    const item = entry.items.find((i: { eventType: string }) => i.eventType === "hoof_trim");
    expect(item.status).toBe("never");
    expect(item.lastEventDate).toBeNull();
    expect(item.dueDate).toBeNull();
    expect(item.daysOverdue).toBe(0);
  });

  it("flags a goat as overdue with the right day count", async () => {
    await setIntervals({ hoof_trim: 56 });
    const goat = await createGoat();
    await addEvent(goat.id, "hoof_trim", 70); // 14 days past the 56-day interval

    const res = await adminAgent.get("/api/health-events/due");
    const entry = res.body.goats.find((g: { goat: { id: number } }) => g.goat.id === goat.id);
    const item = entry.items.find((i: { eventType: string }) => i.eventType === "hoof_trim");
    expect(item.status).toBe("overdue");
    expect(item.daysOverdue).toBe(14);
    expect(item.lastEventDate).not.toBeNull();
    expect(item.dueDate).not.toBeNull();
  });

  it("flags a goat inside the lookahead window as due-soon", async () => {
    await setIntervals({ hoof_trim: 56 });
    const goat = await createGoat();
    await addEvent(goat.id, "hoof_trim", 50); // due in 6 days → within 14-day window

    const res = await adminAgent.get("/api/health-events/due");
    const entry = res.body.goats.find((g: { goat: { id: number } }) => g.goat.id === goat.id);
    const item = entry.items.find((i: { eventType: string }) => i.eventType === "hoof_trim");
    expect(item.status).toBe("due-soon");
    expect(item.daysOverdue).toBe(0);
  });

  it("does not flag a goat whose work is not yet due", async () => {
    await setIntervals({ hoof_trim: 56 });
    const goat = await createGoat();
    await addEvent(goat.id, "hoof_trim", 10); // due in 46 days → outside window

    const res = await adminAgent.get("/api/health-events/due");
    const entry = res.body.goats.find((g: { goat: { id: number } }) => g.goat.id === goat.id);
    expect(entry).toBeFalsy();
  });

  it("uses the most recent event for an interval", async () => {
    await setIntervals({ deworming: 30 });
    const goat = await createGoat();
    await addEvent(goat.id, "deworming", 90); // old
    await addEvent(goat.id, "deworming", 5); // most recent → not due yet

    const res = await adminAgent.get("/api/health-events/due");
    const entry = res.body.goats.find((g: { goat: { id: number } }) => g.goat.id === goat.id);
    expect(entry).toBeFalsy();
  });

  it("excludes dead and sold goats but keeps retired-from-breeding goats", async () => {
    await setIntervals({ hoof_trim: 56 });
    const eligible = await createGoat({ herdStatus: "on-farm" });
    const dead = await createGoat({ herdStatus: "dead" });
    const retired = await createGoat({ breedingStatus: "retired" });

    const res = await adminAgent.get("/api/health-events/due");
    const ids = res.body.goats.map((g: { goat: { id: number } }) => g.goat.id);
    expect(ids).toContain(eligible.id);
    expect(ids).not.toContain(dead.id);
    expect(ids).toContain(retired.id);
  });

  it("requires authentication", async () => {
    const res = await request(app).get("/api/health-events/due");
    expect(res.status).toBe(401);
  });
});

describe("POST /api/health-events/bulk", () => {
  it("records a batch for many goats (farmhand allowed)", async () => {
    const goatA = await createGoat();
    const goatB = await createGoat();

    const res = await farmhandAgent.post("/api/health-events/bulk").send({
      eventDate: "2026-07-04T00:00:00.000Z",
      events: [
        { goatId: goatA.id, eventType: "hoof_trim" },
        { goatId: goatA.id, eventType: "famacha", famachaScore: 4 },
        { goatId: goatB.id, eventType: "cdt_shot", dosageMl: 2 },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body.created).toBe(3);

    const listA = await adminAgent.get(`/api/goats/${goatA.id}/health-events`);
    expect(listA.body).toHaveLength(2);
    const famacha = listA.body.find((e: { eventType: string }) => e.eventType === "famacha");
    expect(famacha.famachaScore).toBe(4);

    const listB = await adminAgent.get(`/api/goats/${goatB.id}/health-events`);
    expect(listB.body).toHaveLength(1);
    expect(listB.body[0].dosageMl).toBe(2);
  });

  it("persists mixed per-goat dosage and body weight values", async () => {
    const goatA = await createGoat();
    const goatB = await createGoat();

    const res = await farmhandAgent.post("/api/health-events/bulk").send({
      eventDate: "2026-07-05T00:00:00.000Z",
      events: [
        { goatId: goatA.id, eventType: "deworming", famachaScore: 4, dosageMl: 6, bodyWeight: 120, productName: "Cydectin" },
        { goatId: goatA.id, eventType: "cdt_shot", dosageMl: 2, bodyWeight: 120 },
        { goatId: goatB.id, eventType: "deworming", dosageMl: 4.5, bodyWeight: 95.5, productName: "Cydectin" },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body.created).toBe(3);

    const listA = await adminAgent.get(`/api/goats/${goatA.id}/health-events`);
    expect(listA.body).toHaveLength(2);
    const dewormA = listA.body.find((e: { eventType: string }) => e.eventType === "deworming");
    expect(dewormA.dosageMl).toBe(6);
    expect(dewormA.bodyWeight).toBe(120);
    expect(dewormA.famachaScore).toBe(4);
    const cdtA = listA.body.find((e: { eventType: string }) => e.eventType === "cdt_shot");
    expect(cdtA.dosageMl).toBe(2);
    expect(cdtA.bodyWeight).toBe(120);

    const listB = await adminAgent.get(`/api/goats/${goatB.id}/health-events`);
    expect(listB.body).toHaveLength(1);
    expect(listB.body[0].dosageMl).toBe(4.5);
    expect(listB.body[0].bodyWeight).toBe(95.5);
    expect(listB.body[0].productName).toBe("Cydectin");
  });

  it("rejects the whole batch when any goat is outside the farm", async () => {
    const goat = await createGoat();
    const [foreignGoat] = await db
      .insert(goatsTable)
      .values({ farmId: otherFarmId, name: `Foreign bulk ${RUN_ID}`, sex: "doe", breed: "alpine" })
      .returning();
    createdGoatIds.push(foreignGoat.id);

    const res = await adminAgent.post("/api/health-events/bulk").send({
      eventDate: "2026-07-04T00:00:00.000Z",
      events: [
        { goatId: goat.id, eventType: "hoof_trim" },
        { goatId: foreignGoat.id, eventType: "hoof_trim" },
      ],
    });
    expect(res.status).toBe(404);

    const list = await adminAgent.get(`/api/goats/${goat.id}/health-events`);
    expect(list.body).toHaveLength(0);
  });

  it("rejects an empty batch", async () => {
    const res = await adminAgent.post("/api/health-events/bulk").send({
      eventDate: "2026-07-04T00:00:00.000Z",
      events: [],
    });
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/goats/:id with health events", () => {
  it("deletes a goat and its health events together", async () => {
    const goat = await createGoat();
    const created = await adminAgent.post(`/api/goats/${goat.id}/health-events`).send({
      eventType: "hoof_trim",
      eventDate: "2026-07-04T00:00:00.000Z",
    });
    expect(created.status).toBe(201);

    const res = await adminAgent.delete(`/api/goats/${goat.id}`);
    expect(res.status).toBe(204);

    const rows = await db
      .select()
      .from(healthEventsTable)
      .where(eq(healthEventsTable.goatId, goat.id));
    expect(rows).toHaveLength(0);
  });
});
