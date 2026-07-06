import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request, { type Agent } from "supertest";
import { eq, inArray } from "drizzle-orm";
import bcrypt from "bcrypt";
import { db, usersTable, farmSettingsTable, farmsTable } from "@workspace/db";
import app from "../app";

// Integration tests for the farm-level "uses AI" setting. Reads are open to any
// authenticated user; writes are restricted to admin/owner. These run against the
// live database, so the default farm's farm_settings row value is snapshotted up
// front and restored afterwards, and the seeded test users are removed.

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const FARM_SLUG = "default";
const ADMIN = { username: `settings-admin-${suffix}`, password: "admin-password-123" };
const OWNER = { username: `settings-owner-${suffix}`, password: "owner-password-123" };
const HAND = { username: `settings-hand-${suffix}`, password: "hand-password-123" };

const createdUserIds: number[] = [];
let testFarmId: number;
let originalUsesAi: boolean;
let originalHealthScheduleIntervals: unknown;
let settingsRowId: number;

async function seedUser(
  username: string,
  password: string,
  role: "admin" | "owner" | "farmhand",
) {
  const passwordHash = await bcrypt.hash(password, 10);
  const [user] = await db
    .insert(usersTable)
    .values({ farmId: testFarmId, username, passwordHash, role, active: true })
    .returning();
  createdUserIds.push(user.id);
  return user;
}

async function login(creds: { username: string; password: string }): Promise<Agent> {
  const agent = request.agent(app);
  const res = await agent.post("/api/auth/login").set("X-Farm-Slug", FARM_SLUG).send(creds);
  expect(res.status).toBe(200);
  return agent;
}

beforeAll(async () => {
  const [defaultFarm] = await db
    .select()
    .from(farmsTable)
    .where(eq(farmsTable.slug, FARM_SLUG));
  expect(defaultFarm).toBeTruthy();
  testFarmId = defaultFarm.id;

  await seedUser(ADMIN.username, ADMIN.password, "admin");
  await seedUser(OWNER.username, OWNER.password, "owner");
  await seedUser(HAND.username, HAND.password, "farmhand");

  // A read lazily provisions the default farm's settings row if absent; snapshot
  // its current value so teardown can restore it.
  const adminAgent = await login(ADMIN);
  await adminAgent.get("/api/settings");
  const [row] = await db
    .select()
    .from(farmSettingsTable)
    .where(eq(farmSettingsTable.farmId, testFarmId));
  settingsRowId = row.id;
  originalUsesAi = row.usesAi;
  originalHealthScheduleIntervals = row.healthScheduleIntervals;
});

afterAll(async () => {
  // Restore the original setting value so this suite leaves no side effects.
  await db
    .update(farmSettingsTable)
    .set({
      usesAi: originalUsesAi,
      healthScheduleIntervals:
        (originalHealthScheduleIntervals as Record<string, number> | null) ?? null,
    })
    .where(eq(farmSettingsTable.id, settingsRowId));

  if (createdUserIds.length > 0) {
    await db.delete(usersTable).where(inArray(usersTable.id, createdUserIds));
  }
  const { pool } = await import("@workspace/db");
  await pool.end();
});

describe("farm settings default row", () => {
  it("lazily provisions a default row with uses_ai = true for the farm", async () => {
    // Remove the default farm's settings row, then a read should recreate it with
    // the default value. The afterAll hook restores originalUsesAi onto whatever
    // row id results.
    await db.delete(farmSettingsTable).where(eq(farmSettingsTable.farmId, testFarmId));

    const agent = await login(ADMIN);
    const res = await agent.get("/api/settings");
    expect(res.status).toBe(200);
    expect(res.body.usesAi).toBe(true);

    const [row] = await db
      .select()
      .from(farmSettingsTable)
      .where(eq(farmSettingsTable.farmId, testFarmId));
    expect(row).toBeTruthy();

    // Re-point the snapshot id so teardown restores the original value onto the
    // freshly seeded row.
    settingsRowId = row.id;
  });
});

describe("GET /api/settings", () => {
  it("requires authentication", async () => {
    const res = await request(app).get("/api/settings");
    expect(res.status).toBe(401);
  });

  it("is readable by an admin", async () => {
    const agent = await login(ADMIN);
    const res = await agent.get("/api/settings");
    expect(res.status).toBe(200);
    expect(typeof res.body.usesAi).toBe("boolean");
    expect(res.body.id).toBe(settingsRowId);
  });

  it("is readable by a farm hand", async () => {
    const agent = await login(HAND);
    const res = await agent.get("/api/settings");
    expect(res.status).toBe(200);
    expect(typeof res.body.usesAi).toBe("boolean");
  });
});

describe("PUT /api/settings", () => {
  it("requires authentication", async () => {
    const res = await request(app).put("/api/settings").send({ usesAi: false });
    expect(res.status).toBe(401);
  });

  it("lets an admin toggle the setting off and on", async () => {
    const agent = await login(ADMIN);

    const off = await agent.put("/api/settings").send({ usesAi: false });
    expect(off.status).toBe(200);
    expect(off.body.usesAi).toBe(false);
    expect(off.body.id).toBe(settingsRowId);

    // The change persists across a fresh read.
    const readBack = await agent.get("/api/settings");
    expect(readBack.body.usesAi).toBe(false);

    const on = await agent.put("/api/settings").send({ usesAi: true });
    expect(on.status).toBe(200);
    expect(on.body.usesAi).toBe(true);
  });

  it("lets an owner toggle the setting", async () => {
    const agent = await login(OWNER);

    const off = await agent.put("/api/settings").send({ usesAi: false });
    expect(off.status).toBe(200);
    expect(off.body.usesAi).toBe(false);

    const on = await agent.put("/api/settings").send({ usesAi: true });
    expect(on.status).toBe(200);
    expect(on.body.usesAi).toBe(true);
  });

  it("forbids a farm hand from changing the setting", async () => {
    const agent = await login(HAND);
    const res = await agent.put("/api/settings").send({ usesAi: false });
    expect(res.status).toBe(403);
  });

  it("accepts an empty body as a no-op update", async () => {
    const agent = await login(ADMIN);
    const res = await agent.put("/api/settings").send({});
    expect(res.status).toBe(200);
  });

  it("rejects a non-boolean usesAi value", async () => {
    const agent = await login(ADMIN);
    const res = await agent.put("/api/settings").send({ usesAi: "yes" });
    expect(res.status).toBe(400);
  });

  it("updates farm name, weight unit, and gestation length", async () => {
    const agent = await login(ADMIN);
    const res = await agent
      .put("/api/settings")
      .send({ farmName: "Sunny Meadow", weightUnit: "kg", gestationDays: 155 });
    expect(res.status).toBe(200);
    expect(res.body.farmName).toBe("Sunny Meadow");
    expect(res.body.weightUnit).toBe("kg");
    expect(res.body.gestationDays).toBe(155);

    const readBack = await agent.get("/api/settings");
    expect(readBack.body.farmName).toBe("Sunny Meadow");
    expect(readBack.body.weightUnit).toBe("kg");
    expect(readBack.body.gestationDays).toBe(155);
  });

  it("rejects an invalid weight unit", async () => {
    const agent = await login(ADMIN);
    const res = await agent.put("/api/settings").send({ weightUnit: "stone" });
    expect(res.status).toBe(400);
  });

  it("rejects an out-of-range gestation length", async () => {
    const agent = await login(ADMIN);
    const res = await agent.put("/api/settings").send({ gestationDays: 5 });
    expect(res.status).toBe(400);
  });

  it("persists health schedule intervals and reads them back", async () => {
    const agent = await login(ADMIN);
    const res = await agent
      .put("/api/settings")
      .send({ healthScheduleIntervals: { hoof_trim: 56, deworming: 90 } });
    expect(res.status).toBe(200);
    expect(res.body.healthScheduleIntervals).toEqual({ hoof_trim: 56, deworming: 90 });

    const readBack = await agent.get("/api/settings");
    expect(readBack.body.healthScheduleIntervals).toEqual({ hoof_trim: 56, deworming: 90 });
  });

  it("normalizes schedule intervals: drops unknown keys and floors fractional days", async () => {
    const agent = await login(ADMIN);
    const res = await agent.put("/api/settings").send({
      healthScheduleIntervals: {
        hoof_trim: 42,
        famacha: 30, // not schedulable → dropped
        other: 30, // not schedulable → dropped
        deworming: 45.7, // floored to 45
      },
    });
    expect(res.status).toBe(200);
    expect(res.body.healthScheduleIntervals).toEqual({ hoof_trim: 42, deworming: 45 });
  });

  it("rejects out-of-range schedule intervals", async () => {
    const agent = await login(ADMIN);
    const tooLow = await agent
      .put("/api/settings")
      .send({ healthScheduleIntervals: { cdt_shot: 0 } });
    expect(tooLow.status).toBe(400);

    const tooHigh = await agent
      .put("/api/settings")
      .send({ healthScheduleIntervals: { copper_bolus: 99999 } });
    expect(tooHigh.status).toBe(400);
  });

  it("clears schedule intervals when given an empty object", async () => {
    const agent = await login(ADMIN);
    await agent.put("/api/settings").send({ healthScheduleIntervals: { hoof_trim: 56 } });

    const res = await agent.put("/api/settings").send({ healthScheduleIntervals: {} });
    expect(res.status).toBe(200);
    expect(res.body.healthScheduleIntervals).toEqual({});
  });

  it("forbids a farm hand from changing schedule intervals", async () => {
    const agent = await login(HAND);
    const res = await agent
      .put("/api/settings")
      .send({ healthScheduleIntervals: { hoof_trim: 56 } });
    expect(res.status).toBe(403);
  });
});

describe("dashboard layout customization", () => {
  // The normalizer injects each widget's default 12-column grid placement when
  // the saved entry omits x/y/w/h, so expectations carry the coordinates too.
  const GRID: Record<string, { x: number; y: number; w: number; h: number }> = {
    "total-goats": { x: 0, y: 0, w: 3, h: 3 },
    "health-status": { x: 3, y: 0, w: 3, h: 3 },
    "milking-status": { x: 6, y: 0, w: 3, h: 3 },
    "avg-milk": { x: 9, y: 0, w: 3, h: 3 },
    "does-breakdown": { x: 0, y: 3, w: 6, h: 6 },
    "upcoming-kiddings": { x: 6, y: 3, w: 6, h: 6 },
    "breed-breakdown": { x: 0, y: 9, w: 6, h: 6 },
    "recent-activity": { x: 6, y: 9, w: 6, h: 6 },
    "breeding-calendar": { x: 0, y: 15, w: 6, h: 7 },
    "health-due": { x: 6, y: 15, w: 6, h: 5 },
  };
  const withGrid = (id: string, visible: boolean) => ({ id, visible, ...GRID[id] });

  it("returns a normalized default layout when none is saved", async () => {
    await db
      .update(farmSettingsTable)
      .set({ dashboardLayout: null })
      .where(eq(farmSettingsTable.id, settingsRowId));

    const agent = await login(ADMIN);
    const res = await agent.get("/api/settings");
    expect(res.status).toBe(200);
    expect(res.body.dashboardLayout).toEqual([
      withGrid("total-goats", true),
      withGrid("health-status", true),
      withGrid("milking-status", true),
      withGrid("avg-milk", true),
      withGrid("does-breakdown", true),
      withGrid("upcoming-kiddings", true),
      withGrid("breed-breakdown", true),
      withGrid("recent-activity", true),
      withGrid("breeding-calendar", true),
      withGrid("health-due", true),
    ]);
  });

  it("persists a reordered + hidden layout with grid positions for an admin", async () => {
    const agent = await login(ADMIN);
    const layout = [
      { id: "recent-activity", visible: true, x: 0, y: 0, w: 6, h: 5 },
      { id: "total-goats", visible: false, x: 6, y: 0, w: 3, h: 3 },
      { id: "health-status", visible: true, x: 9, y: 0, w: 3, h: 3 },
      { id: "milking-status", visible: true, x: 0, y: 5, w: 3, h: 3 },
      { id: "avg-milk", visible: true, x: 3, y: 5, w: 3, h: 3 },
      { id: "does-breakdown", visible: true, x: 6, y: 5, w: 6, h: 6 },
      { id: "upcoming-kiddings", visible: true, x: 0, y: 8, w: 6, h: 6 },
      { id: "breed-breakdown", visible: true, x: 0, y: 14, w: 6, h: 6 },
      { id: "breeding-calendar", visible: true, x: 6, y: 14, w: 6, h: 7 },
      { id: "health-due", visible: true, x: 0, y: 20, w: 6, h: 5 },
    ];
    const res = await agent.put("/api/settings").send({ dashboardLayout: layout });
    expect(res.status).toBe(200);
    expect(res.body.dashboardLayout).toEqual(layout);

    const readBack = await agent.get("/api/settings");
    expect(readBack.body.dashboardLayout).toEqual(layout);
  });

  it("forward-migrates a legacy id+visible layout with default grid positions", async () => {
    const agent = await login(ADMIN);
    const res = await agent.put("/api/settings").send({
      dashboardLayout: [
        { id: "total-goats", visible: true },
        { id: "health-status", visible: false },
      ],
    });
    expect(res.status).toBe(200);
    // The two saved widgets keep their order/visibility and gain default grid
    // coordinates; the rest are appended visible in catalog order.
    expect(res.body.dashboardLayout).toEqual([
      withGrid("total-goats", true),
      withGrid("health-status", false),
      withGrid("milking-status", true),
      withGrid("avg-milk", true),
      withGrid("does-breakdown", true),
      withGrid("upcoming-kiddings", true),
      withGrid("breed-breakdown", true),
      withGrid("recent-activity", true),
      withGrid("breeding-calendar", true),
      withGrid("health-due", true),
    ]);
  });

  it("strips unknown widget ids and appends missing ones on save", async () => {
    const agent = await login(ADMIN);
    const res = await agent.put("/api/settings").send({
      dashboardLayout: [
        { id: "milking-status", visible: false },
        { id: "totally-fake-widget", visible: true },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.dashboardLayout).toEqual([
      withGrid("milking-status", false),
      withGrid("total-goats", true),
      withGrid("health-status", true),
      withGrid("avg-milk", true),
      withGrid("does-breakdown", true),
      withGrid("upcoming-kiddings", true),
      withGrid("breed-breakdown", true),
      withGrid("recent-activity", true),
      // A newly-shipped widget is appended visible to a layout that predates it.
      withGrid("breeding-calendar", true),
      withGrid("health-due", true),
    ]);
  });

  it("forbids a farm hand from changing the layout", async () => {
    const agent = await login(HAND);
    const res = await agent
      .put("/api/settings")
      .send({ dashboardLayout: [{ id: "total-goats", visible: false }] });
    expect(res.status).toBe(403);
  });
});
