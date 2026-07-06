import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request, { type Agent } from "supertest";
import { eq, inArray } from "drizzle-orm";
import bcrypt from "bcrypt";
import { db, goatsTable, usersTable, farmSettingsTable, farmsTable } from "@workspace/db";
import app from "../app";
import { createFarm } from "../lib/createFarm";

// Integration tests for POST /api/goats/:id/photos — the quick photo capture
// shortcut. It must (a) work for Farm Hands (who are otherwise read-only on
// goats), (b) never exceed the 4-photo maximum, (c) stay farm-scoped, and
// (d) reject invalid bodies. Two farms are created side by side to prove the
// endpoint cannot append a photo to a goat in another farm.

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const FARM_A = { slug: `photo-a-${suffix}`.slice(0, 32), name: "Photo Farm A", admin: "admin-a", password: "password-a-1" };
const FARM_B = { slug: `photo-b-${suffix}`.slice(0, 32), name: "Photo Farm B", admin: "admin-b", password: "password-b-1" };
const HAND_USERNAME = "farmhand-a";
const HAND_PASSWORD = "farmhand-a-1";

let farmAId: number;
let farmBId: number;
let adminAgentA: Agent;
let handAgentA: Agent;

async function login(slug: string, username: string, password: string): Promise<Agent> {
  const agent = request.agent(app);
  const res = await agent.post("/api/auth/login").set("X-Farm-Slug", slug).send({ username, password });
  expect(res.status).toBe(200);
  return agent;
}

async function createGoat(agent: Agent): Promise<number> {
  const res = await agent
    .post("/api/goats")
    .send({ name: `Photo Goat ${suffix}-${Math.random().toString(36).slice(2, 7)}`, breed: "alpine" });
  expect(res.status).toBe(201);
  return res.body.id as number;
}

beforeAll(async () => {
  const a = await createFarm({
    slug: FARM_A.slug,
    name: FARM_A.name,
    adminUsername: FARM_A.admin,
    adminPassword: FARM_A.password,
  });
  expect(a.ok).toBe(true);
  if (!a.ok) throw new Error(a.error);
  farmAId = a.farm.id;

  const b = await createFarm({
    slug: FARM_B.slug,
    name: FARM_B.name,
    adminUsername: FARM_B.admin,
    adminPassword: FARM_B.password,
  });
  expect(b.ok).toBe(true);
  if (!b.ok) throw new Error(b.error);
  farmBId = b.farm.id;

  // Add a Farm Hand (read-only on goats) to Farm A.
  const passwordHash = await bcrypt.hash(HAND_PASSWORD, 10);
  await db
    .insert(usersTable)
    .values({ farmId: farmAId, username: HAND_USERNAME, passwordHash, role: "farmhand", active: true });

  adminAgentA = await login(FARM_A.slug, FARM_A.admin, FARM_A.password);
  handAgentA = await login(FARM_A.slug, HAND_USERNAME, HAND_PASSWORD);
});

afterAll(async () => {
  const farmIds = [farmAId, farmBId].filter((id) => id != null);
  if (farmIds.length > 0) {
    await db.delete(goatsTable).where(inArray(goatsTable.farmId, farmIds));
    await db.delete(usersTable).where(inArray(usersTable.farmId, farmIds));
    await db.delete(farmSettingsTable).where(inArray(farmSettingsTable.farmId, farmIds));
    await db.delete(farmsTable).where(inArray(farmsTable.id, farmIds));
  }
  const { pool } = await import("@workspace/db");
  await pool.end();
});

describe("POST /api/goats/:id/photos", () => {
  it("lets a Farm Hand append a photo and echoes it back", async () => {
    const goatId = await createGoat(adminAgentA);
    const url = "/api/storage/objects/hand-photo-1.jpg";

    const res = await handAgentA.post(`/api/goats/${goatId}/photos`).send({ imageUrl: url });
    expect(res.status).toBe(200);
    expect(res.body.imageUrls).toEqual([url]);
    // The deprecated alias is populated from the first entry.
    expect(res.body.imageUrl).toBe(url);

    const [row] = await db.select().from(goatsTable).where(eq(goatsTable.id, goatId));
    expect(row.imageUrls).toEqual([url]);
  });

  it("appends the new URL to the end of the existing photos", async () => {
    const goatId = await createGoat(adminAgentA);
    const urls = [
      "/api/storage/objects/photo-1.jpg",
      "/api/storage/objects/photo-2.jpg",
      "/api/storage/objects/photo-3.jpg",
    ];

    for (const url of urls) {
      const res = await adminAgentA.post(`/api/goats/${goatId}/photos`).send({ imageUrl: url });
      expect(res.status).toBe(200);
    }

    const last = await adminAgentA
      .post(`/api/goats/${goatId}/photos`)
      .send({ imageUrl: "/api/storage/objects/photo-4.jpg" });
    expect(last.status).toBe(200);
    expect(last.body.imageUrls).toEqual([...urls, "/api/storage/objects/photo-4.jpg"]);
  });

  it("rejects appending once the goat already has 4 photos", async () => {
    const goatId = await createGoat(adminAgentA);
    for (let i = 1; i <= 4; i++) {
      const res = await adminAgentA
        .post(`/api/goats/${goatId}/photos`)
        .send({ imageUrl: `/api/storage/objects/full-${i}.jpg` });
      expect(res.status).toBe(200);
    }

    const overflow = await adminAgentA
      .post(`/api/goats/${goatId}/photos`)
      .send({ imageUrl: "/api/storage/objects/fifth.jpg" });
    expect(overflow.status).toBe(400);

    // A Farm Hand hits the same limit.
    const handOverflow = await handAgentA
      .post(`/api/goats/${goatId}/photos`)
      .send({ imageUrl: "/api/storage/objects/fifth-hand.jpg" });
    expect(handOverflow.status).toBe(400);

    // Still exactly 4 photos in the database.
    const [row] = await db.select().from(goatsTable).where(eq(goatsTable.id, goatId));
    expect(row.imageUrls).toHaveLength(4);
  });

  it("returns 404 when appending to a goat in another farm", async () => {
    const goatId = await createGoat(adminAgentA);

    const agentB = await login(FARM_B.slug, FARM_B.admin, FARM_B.password);
    const res = await agentB
      .post(`/api/goats/${goatId}/photos`)
      .send({ imageUrl: "/api/storage/objects/cross-farm.jpg" });
    expect(res.status).toBe(404);

    // Farm A's goat is untouched.
    const [row] = await db.select().from(goatsTable).where(eq(goatsTable.id, goatId));
    expect(row.imageUrls ?? []).toEqual([]);
  });

  it("rejects an empty imageUrl with 400", async () => {
    const goatId = await createGoat(adminAgentA);
    const res = await adminAgentA.post(`/api/goats/${goatId}/photos`).send({ imageUrl: "" });
    expect(res.status).toBe(400);
  });

  it("rejects a missing imageUrl with 400", async () => {
    const goatId = await createGoat(adminAgentA);
    const res = await adminAgentA.post(`/api/goats/${goatId}/photos`).send({});
    expect(res.status).toBe(400);
  });
});
