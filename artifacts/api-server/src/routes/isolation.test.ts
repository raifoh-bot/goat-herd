import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request, { type Agent } from "supertest";
import { eq, inArray } from "drizzle-orm";
import { db, goatsTable, usersTable, farmSettingsTable, farmsTable } from "@workspace/db";
import app from "../app";
import { createFarm } from "../lib/createFarm";

// Verifies tenant isolation: two farms created side by side must never see each
// other's data. Each farm is reached via its own X-Farm-Slug, and a goat created
// in one farm must be invisible (and unreachable) to the other.

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const FARM_A = { slug: `iso-a-${suffix}`.slice(0, 32), name: "Farm A", admin: "admin-a", password: "password-a-1" };
const FARM_B = { slug: `iso-b-${suffix}`.slice(0, 32), name: "Farm B", admin: "admin-b", password: "password-b-1" };

let farmAId: number;
let farmBId: number;
let agentA: Agent;
let agentB: Agent;
let goatAId: number;

async function login(slug: string, username: string, password: string): Promise<Agent> {
  const agent = request.agent(app);
  const res = await agent.post("/api/auth/login").set("X-Farm-Slug", slug).send({ username, password });
  expect(res.status).toBe(200);
  return agent;
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

  agentA = await login(FARM_A.slug, FARM_A.admin, FARM_A.password);
  agentB = await login(FARM_B.slug, FARM_B.admin, FARM_B.password);
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

describe("multi-tenant isolation", () => {
  it("creates a goat in farm A scoped to farm A", async () => {
    const res = await agentA
      .post("/api/goats")
      .send({ name: `Isolated Goat ${suffix}`, sex: "doe", breed: "alpine" });
    expect(res.status).toBe(201);
    goatAId = res.body.id as number;

    const [row] = await db.select().from(goatsTable).where(eq(goatsTable.id, goatAId));
    expect(row.farmId).toBe(farmAId);
  });

  it("does not surface farm A's goat in farm B's list", async () => {
    const res = await agentB.get("/api/goats");
    expect(res.status).toBe(200);
    const ids = (res.body as Array<{ id: number }>).map((g) => g.id);
    expect(ids).not.toContain(goatAId);
  });

  it("returns 404 when farm B tries to read farm A's goat by id", async () => {
    const res = await agentB.get(`/api/goats/${goatAId}`);
    expect(res.status).toBe(404);
  });

  it("returns 404 when farm B tries to update farm A's goat", async () => {
    const res = await agentB.put(`/api/goats/${goatAId}`).send({ name: "Hijacked" });
    expect(res.status).toBe(404);
  });

  it("returns 404 when farm B tries to delete farm A's goat", async () => {
    const res = await agentB.delete(`/api/goats/${goatAId}`);
    expect(res.status).toBe(404);

    // The goat still exists, untouched, in farm A.
    const [row] = await db.select().from(goatsTable).where(eq(goatsTable.id, goatAId));
    expect(row).toBeTruthy();
    expect(row.name).toBe(`Isolated Goat ${suffix}`);
  });

  it("does surface farm A's goat in farm A's own list", async () => {
    const res = await agentA.get("/api/goats");
    expect(res.status).toBe(200);
    const ids = (res.body as Array<{ id: number }>).map((g) => g.id);
    expect(ids).toContain(goatAId);
  });
});
