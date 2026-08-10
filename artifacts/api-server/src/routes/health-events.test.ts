import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import request, { type Agent } from "supertest";
import { eq } from "drizzle-orm";
import bcrypt from "bcrypt";
import { db, goatsTable, usersTable, farmsTable, healthEventsTable, farmSettingsTable } from "@workspace/db";
import app from "../app";
import { createFarm } from "../lib/createFarm";

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

  it("records a CIDR insertion with the 12-day default and co-treatments", async () => {
    const goat = await createGoat();
    const res = await adminAgent.post(`/api/goats/${goat.id}/health-events`).send({
      eventType: "cidr",
      eventDate: "2026-07-01T00:00:00.000Z",
      coTreatments: "  PG600 injection  ",
    });
    expect(res.status).toBe(201);
    createdEventIds.push(res.body.id);
    expect(res.body.eventType).toBe("cidr");
    expect(res.body.treatmentDays).toBe(12);
    expect(res.body.coTreatments).toBe("PG600 injection");
  });

  it("accepts an explicit CIDR treatment length", async () => {
    const goat = await createGoat();
    const res = await adminAgent.post(`/api/goats/${goat.id}/health-events`).send({
      eventType: "cidr",
      eventDate: "2026-07-01T00:00:00.000Z",
      treatmentDays: 14,
    });
    expect(res.status).toBe(201);
    createdEventIds.push(res.body.id);
    expect(res.body.treatmentDays).toBe(14);
    expect(res.body.coTreatments).toBeNull();
  });

  it("rejects a non-positive CIDR treatment length", async () => {
    const goat = await createGoat();
    const res = await adminAgent.post(`/api/goats/${goat.id}/health-events`).send({
      eventType: "cidr",
      eventDate: "2026-07-01T00:00:00.000Z",
      treatmentDays: 0,
    });
    expect(res.status).toBe(400);
  });

  it("ignores CIDR fields for other event types", async () => {
    const goat = await createGoat();
    const res = await adminAgent.post(`/api/goats/${goat.id}/health-events`).send({
      eventType: "hoof_trim",
      eventDate: "2026-07-01T00:00:00.000Z",
      treatmentDays: 14,
      coTreatments: "should be dropped",
    });
    expect(res.status).toBe(201);
    createdEventIds.push(res.body.id);
    expect(res.body.treatmentDays).toBeNull();
    expect(res.body.coTreatments).toBeNull();
  });

  it("records a barber pole parasite finding with an egg count", async () => {
    const goat = await createGoat();
    const res = await adminAgent.post(`/api/goats/${goat.id}/health-events`).send({
      eventType: "parasites",
      eventDate: "2026-07-01T00:00:00.000Z",
      parasiteType: "barber_pole",
      eggCount: 1200,
      notes: "fecal test after pale eyelids",
    });
    expect(res.status).toBe(201);
    createdEventIds.push(res.body.id);
    expect(res.body.eventType).toBe("parasites");
    expect(res.body.parasiteType).toBe("barber_pole");
    expect(res.body.eggCount).toBe(1200);
    expect(res.body.treatmentRegimen).toBeNull();
  });

  it("records a coccidia finding with a treatment regimen (and drops the egg count)", async () => {
    const goat = await createGoat();
    const res = await adminAgent.post(`/api/goats/${goat.id}/health-events`).send({
      eventType: "parasites",
      eventDate: "2026-07-01T00:00:00.000Z",
      parasiteType: "coccidia",
      eggCount: 500,
      treatmentRegimen: "  Toltrazuril 1 mL/5 lb, repeat in 10 days  ",
    });
    expect(res.status).toBe(201);
    createdEventIds.push(res.body.id);
    expect(res.body.parasiteType).toBe("coccidia");
    expect(res.body.eggCount).toBeNull();
    expect(res.body.treatmentRegimen).toBe("Toltrazuril 1 mL/5 lb, repeat in 10 days");
  });

  it("requires a parasite type on a parasites event", async () => {
    const goat = await createGoat();
    const res = await adminAgent.post(`/api/goats/${goat.id}/health-events`).send({
      eventType: "parasites",
      eventDate: "2026-07-01T00:00:00.000Z",
    });
    expect(res.status).toBe(400);
  });

  it("rejects an invalid parasite type", async () => {
    const goat = await createGoat();
    const res = await adminAgent.post(`/api/goats/${goat.id}/health-events`).send({
      eventType: "parasites",
      eventDate: "2026-07-01T00:00:00.000Z",
      parasiteType: "tapeworm",
    });
    expect(res.status).toBe(400);
  });

  it("ignores parasite fields for other event types", async () => {
    const goat = await createGoat();
    const res = await adminAgent.post(`/api/goats/${goat.id}/health-events`).send({
      eventType: "hoof_trim",
      eventDate: "2026-07-01T00:00:00.000Z",
      parasiteType: "coccidia",
      eggCount: 300,
      treatmentRegimen: "should be dropped",
    });
    expect(res.status).toBe(201);
    createdEventIds.push(res.body.id);
    expect(res.body.parasiteType).toBeNull();
    expect(res.body.eggCount).toBeNull();
    expect(res.body.treatmentRegimen).toBeNull();
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

describe("PUT /api/goats/:id/health-events/:eventId", () => {
  async function seedEvent(goatId: number) {
    const res = await adminAgent.post(`/api/goats/${goatId}/health-events`).send({
      eventType: "deworming",
      eventDate: "2026-06-01T00:00:00.000Z",
      famachaScore: 4,
      productName: "Cydectin",
      dosageMl: 5,
      notes: "original notes",
    });
    expect(res.status).toBe(201);
    createdEventIds.push(res.body.id);
    return res.body as { id: number };
  }

  it("updates fields and clears nullable fields with null", async () => {
    const goat = await createGoat();
    const event = await seedEvent(goat.id);

    const res = await adminAgent.put(`/api/goats/${goat.id}/health-events/${event.id}`).send({
      eventDate: "2026-06-15T00:00:00.000Z",
      famachaScore: 2,
      productName: "Valbazen",
      dosageMl: null,
      notes: null,
    });
    expect(res.status).toBe(200);
    expect(res.body.famachaScore).toBe(2);
    expect(res.body.productName).toBe("Valbazen");
    expect(res.body.dosageMl).toBeNull();
    expect(res.body.notes).toBeNull();
    expect(new Date(res.body.eventDate).toISOString()).toBe("2026-06-15T00:00:00.000Z");
  });

  it("drops the FAMACHA score when the type changes to a non-FAMACHA event", async () => {
    const goat = await createGoat();
    const event = await seedEvent(goat.id);

    const res = await adminAgent
      .put(`/api/goats/${goat.id}/health-events/${event.id}`)
      .send({ eventType: "hoof_trim" });
    expect(res.status).toBe(200);
    expect(res.body.eventType).toBe("hoof_trim");
    expect(res.body.famachaScore).toBeNull();
  });

  it("adjusts a CIDR event's treatment length and co-treatments", async () => {
    const goat = await createGoat();
    const created = await adminAgent.post(`/api/goats/${goat.id}/health-events`).send({
      eventType: "cidr",
      eventDate: "2026-06-01T00:00:00.000Z",
      coTreatments: "PG600",
    });
    expect(created.status).toBe(201);
    createdEventIds.push(created.body.id);

    const res = await adminAgent
      .put(`/api/goats/${goat.id}/health-events/${created.body.id}`)
      .send({ treatmentDays: 10, coTreatments: "PG600 + dewormer" });
    expect(res.status).toBe(200);
    expect(res.body.treatmentDays).toBe(10);
    expect(res.body.coTreatments).toBe("PG600 + dewormer");
  });

  it("restores the default treatment length when a CIDR update sends null", async () => {
    const goat = await createGoat();
    const created = await adminAgent.post(`/api/goats/${goat.id}/health-events`).send({
      eventType: "cidr",
      eventDate: "2026-06-01T00:00:00.000Z",
      treatmentDays: 14,
    });
    createdEventIds.push(created.body.id);

    const res = await adminAgent
      .put(`/api/goats/${goat.id}/health-events/${created.body.id}`)
      .send({ treatmentDays: null });
    expect(res.status).toBe(200);
    expect(res.body.treatmentDays).toBe(12);
  });

  it("clears CIDR fields when the type changes away from CIDR", async () => {
    const goat = await createGoat();
    const created = await adminAgent.post(`/api/goats/${goat.id}/health-events`).send({
      eventType: "cidr",
      eventDate: "2026-06-01T00:00:00.000Z",
      treatmentDays: 14,
      coTreatments: "PG600",
    });
    createdEventIds.push(created.body.id);

    const res = await adminAgent
      .put(`/api/goats/${goat.id}/health-events/${created.body.id}`)
      .send({ eventType: "hoof_trim" });
    expect(res.status).toBe(200);
    expect(res.body.treatmentDays).toBeNull();
    expect(res.body.coTreatments).toBeNull();
  });

  it("backfills the default treatment length when a type changes to CIDR", async () => {
    const goat = await createGoat();
    const event = await seedEvent(goat.id);

    const res = await adminAgent
      .put(`/api/goats/${goat.id}/health-events/${event.id}`)
      .send({ eventType: "cidr" });
    expect(res.status).toBe(200);
    expect(res.body.eventType).toBe("cidr");
    expect(res.body.treatmentDays).toBe(12);
  });

  it("updates a parasites event and switches the parasite kind", async () => {
    const goat = await createGoat();
    const created = await adminAgent.post(`/api/goats/${goat.id}/health-events`).send({
      eventType: "parasites",
      eventDate: "2026-06-01T00:00:00.000Z",
      parasiteType: "barber_pole",
      eggCount: 800,
    });
    expect(created.status).toBe(201);
    createdEventIds.push(created.body.id);

    // Switching to coccidia clears the barber-pole egg count and takes a regimen.
    const res = await adminAgent
      .put(`/api/goats/${goat.id}/health-events/${created.body.id}`)
      .send({ parasiteType: "coccidia", treatmentRegimen: "Corid 5-day course" });
    expect(res.status).toBe(200);
    expect(res.body.parasiteType).toBe("coccidia");
    expect(res.body.eggCount).toBeNull();
    expect(res.body.treatmentRegimen).toBe("Corid 5-day course");
  });

  it("clears parasite fields when the type changes away from parasites", async () => {
    const goat = await createGoat();
    const created = await adminAgent.post(`/api/goats/${goat.id}/health-events`).send({
      eventType: "parasites",
      eventDate: "2026-06-01T00:00:00.000Z",
      parasiteType: "barber_pole",
      eggCount: 800,
    });
    expect(created.status).toBe(201);
    createdEventIds.push(created.body.id);

    const res = await adminAgent
      .put(`/api/goats/${goat.id}/health-events/${created.body.id}`)
      .send({ eventType: "other" });
    expect(res.status).toBe(200);
    expect(res.body.eventType).toBe("other");
    expect(res.body.parasiteType).toBeNull();
    expect(res.body.eggCount).toBeNull();
    expect(res.body.treatmentRegimen).toBeNull();
  });

  it("requires a parasite type when changing an event to parasites", async () => {
    const goat = await createGoat();
    const event = await seedEvent(goat.id);

    const missing = await adminAgent
      .put(`/api/goats/${goat.id}/health-events/${event.id}`)
      .send({ eventType: "parasites" });
    expect(missing.status).toBe(400);

    const res = await adminAgent
      .put(`/api/goats/${goat.id}/health-events/${event.id}`)
      .send({ eventType: "parasites", parasiteType: "barber_pole", eggCount: 250 });
    expect(res.status).toBe(200);
    expect(res.body.eventType).toBe("parasites");
    expect(res.body.parasiteType).toBe("barber_pole");
    expect(res.body.eggCount).toBe(250);
    // Non-parasite extras from the original deworming event are cleared/kept
    // per the standard invariants.
    expect(res.body.famachaScore).toBeNull();
  });

  it("allows a farmhand to edit an event", async () => {
    const goat = await createGoat();
    const event = await seedEvent(goat.id);

    const res = await farmhandAgent
      .put(`/api/goats/${goat.id}/health-events/${event.id}`)
      .send({ notes: "corrected by farmhand" });
    expect(res.status).toBe(200);
    expect(res.body.notes).toBe("corrected by farmhand");
  });

  it("rejects an invalid body with 400", async () => {
    const goat = await createGoat();
    const event = await seedEvent(goat.id);

    const res = await adminAgent
      .put(`/api/goats/${goat.id}/health-events/${event.id}`)
      .send({ famachaScore: 9 });
    expect(res.status).toBe(400);
  });

  it("404s for a goat in another farm", async () => {
    const goat = await createGoat({ farmId: otherFarmId });
    const res = await adminAgent
      .put(`/api/goats/${goat.id}/health-events/1`)
      .send({ notes: "nope" });
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

  // The due calculations depend on farm-level schedule settings. Other test
  // files run in parallel against the shared default farm and may touch its
  // settings row, so this suite gets a farm of its own: nothing outside it can
  // contaminate the intervals, and its cleanup can't disturb anyone else.
  const DUE_FARM = {
    slug: `test-due-${RUN_ID}`.slice(0, 32),
    admin: `test-due-admin-${RUN_ID}`,
  };
  let dueFarmId: number;
  let dueAgent: Agent;
  const dueGoatIds: number[] = [];

  beforeAll(async () => {
    const created = await createFarm({
      slug: DUE_FARM.slug,
      name: "Due Test Farm",
      adminUsername: DUE_FARM.admin,
      adminPassword: TEST_PASSWORD,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error(created.error);
    dueFarmId = created.farm.id;

    dueAgent = request.agent(app);
    const res = await dueAgent
      .post("/api/auth/login")
      .set("X-Farm-Slug", DUE_FARM.slug)
      .send({ username: DUE_FARM.admin, password: TEST_PASSWORD });
    expect(res.status).toBe(200);
  });

  afterAll(async () => {
    await db.delete(healthEventsTable).where(eq(healthEventsTable.farmId, dueFarmId));
    await db.delete(goatsTable).where(eq(goatsTable.farmId, dueFarmId));
    await db.delete(usersTable).where(eq(usersTable.farmId, dueFarmId));
    await db.delete(farmSettingsTable).where(eq(farmSettingsTable.farmId, dueFarmId));
    await db.delete(farmsTable).where(eq(farmsTable.id, dueFarmId));
  });

  afterEach(async () => {
    // Reset this suite's own farm between tests; goats/events cascade-cleaned
    // here rather than via the shared trackers (they belong to dueFarmId).
    await db.delete(healthEventsTable).where(eq(healthEventsTable.farmId, dueFarmId));
    for (const goatId of dueGoatIds) {
      await db.delete(goatsTable).where(eq(goatsTable.id, goatId));
    }
    dueGoatIds.length = 0;
    await db
      .update(farmSettingsTable)
      .set({ healthScheduleIntervals: null })
      .where(eq(farmSettingsTable.farmId, dueFarmId));
  });

  async function createDueGoat(overrides: Partial<typeof goatsTable.$inferInsert> = {}) {
    const [goat] = await db
      .insert(goatsTable)
      .values({
        farmId: dueFarmId,
        name: `Due Goat ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        sex: "doe",
        breed: "alpine",
        ...overrides,
      })
      .returning();
    dueGoatIds.push(goat.id);
    return goat;
  }

  async function addEvent(
    goatId: number,
    eventType: "hoof_trim" | "cdt_shot" | "copper_bolus" | "deworming",
    daysAgo: number,
  ) {
    const [ev] = await db
      .insert(healthEventsTable)
      .values({
        farmId: dueFarmId,
        goatId,
        eventType,
        eventDate: new Date(Date.now() - daysAgo * DAY_MS),
      })
      .returning();
    return ev;
  }

  async function addCidr(goatId: number, daysAgo: number, treatmentDays: number) {
    const [ev] = await db
      .insert(healthEventsTable)
      .values({
        farmId: dueFarmId,
        goatId,
        eventType: "cidr",
        eventDate: new Date(Date.now() - daysAgo * DAY_MS),
        treatmentDays,
      })
      .returning();
    return ev;
  }

  async function setIntervals(intervals: Record<string, number>) {
    // A read lazily provisions the settings row for the farm.
    await dueAgent.get("/api/settings");
    await db
      .update(farmSettingsTable)
      .set({ healthScheduleIntervals: intervals })
      .where(eq(farmSettingsTable.farmId, dueFarmId));
  }

  it("returns nothing due when no intervals are configured", async () => {
    await setIntervals({});
    await createDueGoat();
    const res = await dueAgent.get("/api/health-events/due");
    expect(res.status).toBe(200);
    expect(res.body.intervals).toEqual({});
    expect(res.body.goats).toEqual([]);
  });

  it("flags a goat that has never had the scheduled work as 'never'", async () => {
    await setIntervals({ hoof_trim: 56 });
    const goat = await createDueGoat();

    const res = await dueAgent.get("/api/health-events/due");
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
    const goat = await createDueGoat();
    await addEvent(goat.id, "hoof_trim", 70); // 14 days past the 56-day interval

    const res = await dueAgent.get("/api/health-events/due");
    const entry = res.body.goats.find((g: { goat: { id: number } }) => g.goat.id === goat.id);
    const item = entry.items.find((i: { eventType: string }) => i.eventType === "hoof_trim");
    expect(item.status).toBe("overdue");
    expect(item.daysOverdue).toBe(14);
    expect(item.lastEventDate).not.toBeNull();
    expect(item.dueDate).not.toBeNull();
  });

  it("flags a goat inside the lookahead window as due-soon", async () => {
    await setIntervals({ hoof_trim: 56 });
    const goat = await createDueGoat();
    await addEvent(goat.id, "hoof_trim", 50); // due in 6 days → within 14-day window

    const res = await dueAgent.get("/api/health-events/due");
    const entry = res.body.goats.find((g: { goat: { id: number } }) => g.goat.id === goat.id);
    const item = entry.items.find((i: { eventType: string }) => i.eventType === "hoof_trim");
    expect(item.status).toBe("due-soon");
    expect(item.daysOverdue).toBe(0);
  });

  it("does not flag a goat whose work is not yet due", async () => {
    await setIntervals({ hoof_trim: 56 });
    const goat = await createDueGoat();
    await addEvent(goat.id, "hoof_trim", 10); // due in 46 days → outside window

    const res = await dueAgent.get("/api/health-events/due");
    const entry = res.body.goats.find((g: { goat: { id: number } }) => g.goat.id === goat.id);
    expect(entry).toBeFalsy();
  });

  it("uses the most recent event for an interval", async () => {
    await setIntervals({ deworming: 30 });
    const goat = await createDueGoat();
    await addEvent(goat.id, "deworming", 90); // old
    await addEvent(goat.id, "deworming", 5); // most recent → not due yet

    const res = await dueAgent.get("/api/health-events/due");
    const entry = res.body.goats.find((g: { goat: { id: number } }) => g.goat.id === goat.id);
    expect(entry).toBeFalsy();
  });

  it("only includes on-farm goats (null herdStatus counts as on-farm)", async () => {
    await setIntervals({ hoof_trim: 56 });
    const eligible = await createDueGoat({ herdStatus: "on-farm" });
    const noStatus = await createDueGoat({ herdStatus: null });
    const leased = await createDueGoat({ herdStatus: "leased" });
    const dead = await createDueGoat({ herdStatus: "dead" });
    const retired = await createDueGoat({ breedingStatus: "retired" });

    const res = await dueAgent.get("/api/health-events/due");
    const ids = res.body.goats.map((g: { goat: { id: number } }) => g.goat.id);
    expect(ids).toContain(eligible.id);
    expect(ids).toContain(noStatus.id);
    expect(ids).toContain(retired.id);
    expect(ids).not.toContain(leased.id);
    expect(ids).not.toContain(dead.id);
  });

  it("requires authentication", async () => {
    const res = await request(app).get("/api/health-events/due");
    expect(res.status).toBe(401);
  });

  it("flags an upcoming CIDR removal as due-soon even with no intervals configured", async () => {
    await setIntervals({});
    const goat = await createDueGoat();
    await addCidr(goat.id, 8, 12); // removal in 4 days

    const res = await dueAgent.get("/api/health-events/due");
    expect(res.status).toBe(200);
    const entry = res.body.goats.find((g: { goat: { id: number } }) => g.goat.id === goat.id);
    expect(entry).toBeTruthy();
    const item = entry.items.find((i: { eventType: string }) => i.eventType === "cidr");
    expect(item.status).toBe("due-soon");
    expect(item.intervalDays).toBe(12);
    expect(item.daysOverdue).toBe(0);
    expect(new Date(item.dueDate).getTime()).toBeGreaterThan(Date.now());
  });

  it("flags a missed CIDR removal as overdue with the right day count", async () => {
    await setIntervals({});
    const goat = await createDueGoat();
    await addCidr(goat.id, 15, 12); // removal was 3 days ago

    const res = await dueAgent.get("/api/health-events/due");
    const entry = res.body.goats.find((g: { goat: { id: number } }) => g.goat.id === goat.id);
    const item = entry.items.find((i: { eventType: string }) => i.eventType === "cidr");
    expect(item.status).toBe("overdue");
    expect(item.daysOverdue).toBe(3);
  });

  it("does not flag a CIDR whose removal is beyond the lookahead window", async () => {
    await setIntervals({});
    const goat = await createDueGoat();
    await addCidr(goat.id, 2, 30); // removal in 28 days → outside 14-day window

    const res = await dueAgent.get("/api/health-events/due");
    const entry = res.body.goats.find((g: { goat: { id: number } }) => g.goat.id === goat.id);
    expect(entry).toBeFalsy();
  });

  it("stops flagging a CIDR removal missed longer than the overdue horizon", async () => {
    await setIntervals({});
    const goat = await createDueGoat();
    await addCidr(goat.id, 50, 12); // removal 38 days ago → past the 30-day horizon

    const res = await dueAgent.get("/api/health-events/due");
    const entry = res.body.goats.find((g: { goat: { id: number } }) => g.goat.id === goat.id);
    expect(entry).toBeFalsy();
  });

  it("only considers the most recent CIDR insertion per goat", async () => {
    await setIntervals({});
    const goat = await createDueGoat();
    await addCidr(goat.id, 20, 12); // old device, removal 8 days ago
    await addCidr(goat.id, 1, 12); // current device, removal in 11 days

    const res = await dueAgent.get("/api/health-events/due");
    const entry = res.body.goats.find((g: { goat: { id: number } }) => g.goat.id === goat.id);
    const items = entry.items.filter((i: { eventType: string }) => i.eventType === "cidr");
    expect(items).toHaveLength(1);
    expect(items[0].status).toBe("due-soon");
  });

  it("reports CIDR removals alongside routine schedule items", async () => {
    await setIntervals({ hoof_trim: 56 });
    const goat = await createDueGoat();
    await addEvent(goat.id, "hoof_trim", 70); // overdue routine work
    await addCidr(goat.id, 8, 12); // removal in 4 days

    const res = await dueAgent.get("/api/health-events/due");
    const entry = res.body.goats.find((g: { goat: { id: number } }) => g.goat.id === goat.id);
    const types = entry.items.map((i: { eventType: string }) => i.eventType).sort();
    expect(types).toEqual(["cidr", "hoof_trim"]);
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
