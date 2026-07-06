import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import request, { type Agent } from "supertest";
import { eq } from "drizzle-orm";
import bcrypt from "bcrypt";
import { db, goatsTable, usersTable, farmsTable } from "@workspace/db";
import { randomUUID } from "crypto";
import { ObjectStorageService } from "../lib/objectStorage";
import app from "../app";

// Helpers to build photo paths in the exact form the frontend persists them
// (`/api/storage/objects/uploads/<uuid>`) and the bare internal form.
const photoUrl = (uuid: string = randomUUID()) => `/api/storage/objects/uploads/${uuid}`;
const bareObjectUrl = (uuid: string) => `/objects/uploads/${uuid}`;

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

describe("Orphaned photo cleanup", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("deletes all of a goat's photo objects when the goat is deleted", async () => {
    const spy = vi
      .spyOn(ObjectStorageService.prototype, "deleteObjectEntity")
      .mockResolvedValue(true);

    const createRes = await agent.post("/api/goats").send({
      name: `Test Goat ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      breed: "alpine",
    });
    expect(createRes.status).toBe(201);
    const goatId = createRes.body.id as number;
    createdGoatIds.push(goatId);

    const uuidA = randomUUID();
    const uuidB = randomUUID();
    const setRes = await agent
      .put(`/api/goats/${goatId}`)
      .send({ imageUrls: [photoUrl(uuidA), photoUrl(uuidB)] });
    expect(setRes.status).toBe(200);
    spy.mockClear();

    const deleteRes = await agent.delete(`/api/goats/${goatId}`);
    expect(deleteRes.status).toBe(204);

    // Cleanup canonicalizes to the bare `/objects/uploads/<uuid>` key.
    expect(spy).toHaveBeenCalledWith(bareObjectUrl(uuidA));
    expect(spy).toHaveBeenCalledWith(bareObjectUrl(uuidB));
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("deletes only the removed photo when a photo is replaced/removed on update", async () => {
    const spy = vi
      .spyOn(ObjectStorageService.prototype, "deleteObjectEntity")
      .mockResolvedValue(true);

    const createRes = await agent.post("/api/goats").send({
      name: `Test Goat ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      breed: "alpine",
    });
    expect(createRes.status).toBe(201);
    const goatId = createRes.body.id as number;
    createdGoatIds.push(goatId);

    const uuidA = randomUUID();
    const uuidB = randomUUID();
    const photoA = photoUrl(uuidA);
    const setRes = await agent
      .put(`/api/goats/${goatId}`)
      .send({ imageUrls: [photoA, photoUrl(uuidB)] });
    expect(setRes.status).toBe(200);
    spy.mockClear();

    // Keep photoA, drop photoB — only photoB should be cleaned up.
    const updateRes = await agent.put(`/api/goats/${goatId}`).send({ imageUrls: [photoA] });
    expect(updateRes.status).toBe(200);

    expect(spy).toHaveBeenCalledWith(bareObjectUrl(uuidB));
    expect(spy).not.toHaveBeenCalledWith(bareObjectUrl(uuidA));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("does not touch storage when an update leaves the photo set unchanged", async () => {
    const spy = vi
      .spyOn(ObjectStorageService.prototype, "deleteObjectEntity")
      .mockResolvedValue(true);

    const createRes = await agent.post("/api/goats").send({
      name: `Test Goat ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      breed: "alpine",
    });
    expect(createRes.status).toBe(201);
    const goatId = createRes.body.id as number;
    createdGoatIds.push(goatId);

    const photoA = photoUrl();
    const setRes = await agent.put(`/api/goats/${goatId}`).send({ imageUrls: [photoA] });
    expect(setRes.status).toBe(200);
    spy.mockClear();

    // An unrelated field change must not delete the retained photo.
    const updateRes = await agent.put(`/api/goats/${goatId}`).send({ description: "grazing" });
    expect(updateRes.status).toBe(200);

    expect(spy).not.toHaveBeenCalled();
  });

  it("does not delete a photo object that another goat still references", async () => {
    const spy = vi
      .spyOn(ObjectStorageService.prototype, "deleteObjectEntity")
      .mockResolvedValue(true);

    // Goat A legitimately owns `sharedPhoto`.
    const createA = await agent.post("/api/goats").send({
      name: `Owner ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      breed: "alpine",
    });
    expect(createA.status).toBe(201);
    const goatA = createA.body.id as number;
    createdGoatIds.push(goatA);
    const sharedUuid = randomUUID();
    const sharedPhoto = photoUrl(sharedUuid);
    expect((await agent.put(`/api/goats/${goatA}`).send({ imageUrls: [sharedPhoto] })).status).toBe(200);

    // Goat B forges a reference to A's photo alongside one it actually owns.
    const createB = await agent.post("/api/goats").send({
      name: `Forger ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      breed: "alpine",
    });
    expect(createB.status).toBe(201);
    const goatB = createB.body.id as number;
    createdGoatIds.push(goatB);
    const ownUuid = randomUUID();
    const ownPhoto = photoUrl(ownUuid);
    expect(
      (await agent.put(`/api/goats/${goatB}`).send({ imageUrls: [sharedPhoto, ownPhoto] })).status,
    ).toBe(200);
    spy.mockClear();

    // B removes both photos. Only its own photo should be deleted; the shared
    // one must survive because A still references it.
    const updateRes = await agent.put(`/api/goats/${goatB}`).send({ imageUrls: [] });
    expect(updateRes.status).toBe(200);

    expect(spy).toHaveBeenCalledWith(bareObjectUrl(ownUuid));
    expect(spy).not.toHaveBeenCalledWith(bareObjectUrl(sharedUuid));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("still deletes the goat (204) even when storage cleanup fails", async () => {
    vi.spyOn(ObjectStorageService.prototype, "deleteObjectEntity").mockRejectedValue(
      new Error("storage unavailable"),
    );

    const createRes = await agent.post("/api/goats").send({
      name: `Test Goat ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      breed: "alpine",
    });
    expect(createRes.status).toBe(201);
    const goatId = createRes.body.id as number;
    createdGoatIds.push(goatId);

    const setRes = await agent
      .put(`/api/goats/${goatId}`)
      .send({ imageUrls: [photoUrl()] });
    expect(setRes.status).toBe(200);

    const deleteRes = await agent.delete(`/api/goats/${goatId}`);
    expect(deleteRes.status).toBe(204);
  });

  it("skips deletion when a differently-formatted path references the same object", async () => {
    const spy = vi
      .spyOn(ObjectStorageService.prototype, "deleteObjectEntity")
      .mockResolvedValue(true);

    // Victim goat stores the object in the frontend `/api/storage/...` form.
    const uuid = randomUUID();
    const createVictim = await agent.post("/api/goats").send({
      name: `Victim ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      breed: "alpine",
    });
    expect(createVictim.status).toBe(201);
    const victimId = createVictim.body.id as number;
    createdGoatIds.push(victimId);
    expect(
      (await agent.put(`/api/goats/${victimId}`).send({ imageUrls: [photoUrl(uuid)] })).status,
    ).toBe(200);

    // Attacker goat references the SAME underlying object via the bare
    // `/objects/uploads/<uuid>` form, then removes it.
    const createAttacker = await agent.post("/api/goats").send({
      name: `Attacker ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      breed: "alpine",
    });
    expect(createAttacker.status).toBe(201);
    const attackerId = createAttacker.body.id as number;
    createdGoatIds.push(attackerId);
    expect(
      (await agent.put(`/api/goats/${attackerId}`).send({ imageUrls: [bareObjectUrl(uuid)] })).status,
    ).toBe(200);
    spy.mockClear();

    const updateRes = await agent.put(`/api/goats/${attackerId}`).send({ imageUrls: [] });
    expect(updateRes.status).toBe(200);

    // The victim still references the object (in another representation), so it
    // must NOT be deleted despite the alternate path form.
    expect(spy).not.toHaveBeenCalled();
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
