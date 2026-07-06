import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import request, { type Agent } from "supertest";
import { eq } from "drizzle-orm";
import bcrypt from "bcrypt";
import { db, goatsTable, usersTable, farmsTable } from "@workspace/db";
import app from "../app";

// These integration tests exercise tattoo/EID clearing semantics on goat updates.
// They run against the live database, so every created row is tracked and removed
// afterwards. All API routes require authentication, so the suite logs in as a
// seeded admin user and issues every request through the cookie-bearing agent.

const createdGoatIds: number[] = [];

const TEST_USERNAME = `test-admin-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const TEST_PASSWORD = "test-password-123";
const FARM_SLUG = "default";
let testUserId: number;
let testFarmId: number;
let agent: Agent;

async function getGoat(id: number) {
  const [goat] = await db.select().from(goatsTable).where(eq(goatsTable.id, id));
  return goat;
}

afterEach(async () => {
  for (const goatId of createdGoatIds) {
    await db.delete(goatsTable).where(eq(goatsTable.id, goatId));
  }
  createdGoatIds.length = 0;
});

beforeAll(async () => {
  const [defaultFarm] = await db
    .select()
    .from(farmsTable)
    .where(eq(farmsTable.slug, FARM_SLUG));
  expect(defaultFarm).toBeTruthy();
  testFarmId = defaultFarm.id;

  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
  const [user] = await db
    .insert(usersTable)
    .values({ farmId: testFarmId, username: TEST_USERNAME, passwordHash, role: "admin", active: true })
    .returning();
  testUserId = user.id;

  agent = request.agent(app);
  const loginRes = await agent
    .post("/api/auth/login")
    .set("X-Farm-Slug", FARM_SLUG)
    .send({ username: TEST_USERNAME, password: TEST_PASSWORD });
  expect(loginRes.status).toBe(200);
});

afterAll(async () => {
  await db.delete(usersTable).where(eq(usersTable.id, testUserId));
  const { pool } = await import("@workspace/db");
  await pool.end();
});

describe("PUT /api/goats/:id tattoo and EID clearing", () => {
  it("clears a tattoo location and EID when null is sent", async () => {
    const createRes = await agent.post("/api/goats").send({
      name: `Test Goat ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      breed: "alpine",
      rightEarTattoo: "A1B2",
      leftTailTattoo: "C3D4",
      eidNumber: "982000123456789",
    });
    expect(createRes.status).toBe(201);
    const goatId = createRes.body.id as number;
    createdGoatIds.push(goatId);

    // Confirm the values persisted on create.
    const created = await getGoat(goatId);
    expect(created.rightEarTattoo).toBe("A1B2");
    expect(created.leftTailTattoo).toBe("C3D4");
    expect(created.eidNumber).toBe("982000123456789");

    // Removing a tattoo location and clearing the EID sends explicit nulls.
    const updateRes = await agent.put(`/api/goats/${goatId}`).send({
      rightEarTattoo: null,
      eidNumber: null,
    });
    expect(updateRes.status).toBe(200);

    // The removed values are cleared in the database; untouched ones remain.
    const updated = await getGoat(goatId);
    expect(updated.rightEarTattoo).toBeNull();
    expect(updated.eidNumber).toBeNull();
    expect(updated.leftTailTattoo).toBe("C3D4");

    // The GET response no longer surfaces the cleared values.
    const getRes = await agent.get(`/api/goats/${goatId}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.rightEarTattoo == null).toBe(true);
    expect(getRes.body.eidNumber == null).toBe(true);
    expect(getRes.body.leftTailTattoo).toBe("C3D4");
  });
});

describe("PUT /api/goats/:id/photos/default", () => {
  async function createGoatWithPhotos(count: number): Promise<number> {
    const createRes = await agent.post("/api/goats").send({
      name: `Test Goat ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      breed: "alpine",
      imageUrls: Array.from({ length: count }, (_, i) => `/api/storage/objects/photo-${i}.jpg`),
    });
    expect(createRes.status).toBe(201);
    const goatId = createRes.body.id as number;
    createdGoatIds.push(goatId);
    return goatId;
  }

  it("defaults imageUrl to the newest photo when no default is set", async () => {
    const goatId = await createGoatWithPhotos(3);
    const getRes = await agent.get(`/api/goats/${goatId}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.defaultPhotoIndex == null).toBe(true);
    expect(getRes.body.imageUrl).toBe("/api/storage/objects/photo-2.jpg");
  });

  it("sets a chosen default and reflects it in imageUrl", async () => {
    const goatId = await createGoatWithPhotos(3);
    const setRes = await agent.put(`/api/goats/${goatId}/photos/default`).send({ index: 0 });
    expect(setRes.status).toBe(200);
    expect(setRes.body.defaultPhotoIndex).toBe(0);
    expect(setRes.body.imageUrl).toBe("/api/storage/objects/photo-0.jpg");

    const stored = await getGoat(goatId);
    expect(stored.defaultPhotoIndex).toBe(0);
  });

  it("rejects an out-of-bounds index", async () => {
    const goatId = await createGoatWithPhotos(2);
    const setRes = await agent.put(`/api/goats/${goatId}/photos/default`).send({ index: 5 });
    expect(setRes.status).toBe(400);
  });

  it("returns 404 for a goat that does not exist", async () => {
    const setRes = await agent.put(`/api/goats/99999999/photos/default`).send({ index: 0 });
    expect(setRes.status).toBe(404);
  });
});

describe("dashboard responses resolve the default photo", () => {
  it("recent-activity reflects the chosen default (else newest) photo", async () => {
    const createRes = await agent.post("/api/goats").send({
      name: `Test Goat ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      breed: "alpine",
      imageUrls: ["/api/storage/objects/x.jpg", "/api/storage/objects/y.jpg"],
    });
    expect(createRes.status).toBe(201);
    const goatId = createRes.body.id as number;
    createdGoatIds.push(goatId);

    // No default set yet → newest (last) photo.
    let res = await agent.get("/api/dashboard/recent-activity");
    expect(res.status).toBe(200);
    let entry = (res.body as Array<{ id: number; imageUrl: string | null }>).find((g) => g.id === goatId);
    expect(entry?.imageUrl).toBe("/api/storage/objects/y.jpg");

    // Choose the first photo as default → recent-activity follows it.
    const setRes = await agent.put(`/api/goats/${goatId}/photos/default`).send({ index: 0 });
    expect(setRes.status).toBe(200);
    res = await agent.get("/api/dashboard/recent-activity");
    expect(res.status).toBe(200);
    entry = (res.body as Array<{ id: number; imageUrl: string | null }>).find((g) => g.id === goatId);
    expect(entry?.imageUrl).toBe("/api/storage/objects/x.jpg");
  });
});

describe("Center Tail tattoo length", () => {
  it("accepts an 8-character center tail tattoo and persists it intact", async () => {
    const createRes = await agent.post("/api/goats").send({
      name: `Test Goat ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      breed: "alpine",
      centerTailTattoo: "AB1CD2EF",
    });
    expect(createRes.status).toBe(201);
    const goatId = createRes.body.id as number;
    createdGoatIds.push(goatId);

    const created = await getGoat(goatId);
    expect(created.centerTailTattoo).toBe("AB1CD2EF");
  });

  it("rejects a center tail tattoo longer than 8 characters", async () => {
    const createRes = await agent.post("/api/goats").send({
      name: `Test Goat ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      breed: "alpine",
      centerTailTattoo: "AB1CD2EFG",
    });
    expect(createRes.status).toBe(400);
  });

  it("still rejects other tattoo locations longer than 4 characters", async () => {
    const createRes = await agent.post("/api/goats").send({
      name: `Test Goat ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      breed: "alpine",
      rightEarTattoo: "A1B2C",
    });
    expect(createRes.status).toBe(400);
  });
});
