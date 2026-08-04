import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request, { type Agent } from "supertest";
import { eq, inArray } from "drizzle-orm";
import bcrypt from "bcrypt";
import {
  db,
  farmSettingsTable,
  farmsTable,
  goatsTable,
  showResultsTable,
  showsTable,
  usersTable,
} from "@workspace/db";
import app from "../app";
import { createFarm } from "../lib/createFarm";

// Integration tests for the shows/show-results routes: show CRUD, batch result
// creation (rejecting cross-farm goat IDs atomically), delete-show cascading
// its results, accolades grouping/order, farmhand read-only enforcement, and
// cross-farm 404 isolation.

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const PASSWORD = "test-password-123";
const FARM_A = { slug: `shw-a-${suffix}`.slice(0, 32), name: "Show Farm A", admin: "admin-a" };
const FARM_B = { slug: `shw-b-${suffix}`.slice(0, 32), name: "Show Farm B", admin: "admin-b" };

let farmAId: number;
let farmBId: number;
let agentA: Agent; // admin in farm A
let agentB: Agent; // admin in farm B
let handAgent: Agent; // farmhand in farm A
let handUserId: number;

async function login(slug: string, username: string, password: string): Promise<Agent> {
  const agent = request.agent(app);
  const res = await agent
    .post("/api/auth/login")
    .set("X-Farm-Slug", slug)
    .send({ username, password });
  expect(res.status).toBe(200);
  return agent;
}

async function createGoat(agent: Agent, name: string): Promise<number> {
  const res = await agent.post("/api/goats").send({ name, sex: "doe", breed: "alpine" });
  expect(res.status).toBe(201);
  return res.body.id as number;
}

async function createShow(
  agent: Agent,
  overrides: Partial<{ name: string; location: string; showDate: string; notes: string }> = {},
): Promise<{ id: number; name: string }> {
  const res = await agent.post("/api/shows").send({
    name: `Test Show ${suffix}`,
    location: "County Fairgrounds",
    showDate: "2026-06-15T12:00:00.000Z",
    notes: "First outing",
    ...overrides,
  });
  expect(res.status).toBe(201);
  return res.body as { id: number; name: string };
}

beforeAll(async () => {
  const a = await createFarm({
    slug: FARM_A.slug,
    name: FARM_A.name,
    adminUsername: FARM_A.admin,
    adminPassword: PASSWORD,
  });
  expect(a.ok).toBe(true);
  if (!a.ok) throw new Error(a.error);
  farmAId = a.farm.id;

  const b = await createFarm({
    slug: FARM_B.slug,
    name: FARM_B.name,
    adminUsername: FARM_B.admin,
    adminPassword: PASSWORD,
  });
  expect(b.ok).toBe(true);
  if (!b.ok) throw new Error(b.error);
  farmBId = b.farm.id;

  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const [hand] = await db
    .insert(usersTable)
    .values({
      farmId: farmAId,
      username: `hand-a-${suffix}`,
      passwordHash,
      role: "farmhand",
      active: true,
    })
    .returning();
  handUserId = hand.id;

  agentA = await login(FARM_A.slug, FARM_A.admin, PASSWORD);
  agentB = await login(FARM_B.slug, FARM_B.admin, PASSWORD);
  handAgent = await login(FARM_A.slug, `hand-a-${suffix}`, PASSWORD);
});

afterAll(async () => {
  const farmIds = [farmAId, farmBId].filter((id) => id != null);
  if (farmIds.length > 0) {
    await db.delete(showResultsTable).where(inArray(showResultsTable.farmId, farmIds));
    await db.delete(showsTable).where(inArray(showsTable.farmId, farmIds));
    await db.delete(goatsTable).where(inArray(goatsTable.farmId, farmIds));
    await db.delete(usersTable).where(inArray(usersTable.farmId, farmIds));
    await db.delete(farmSettingsTable).where(inArray(farmSettingsTable.farmId, farmIds));
    await db.delete(farmsTable).where(inArray(farmsTable.id, farmIds));
  }
  const { pool } = await import("@workspace/db");
  await pool.end();
});

describe("show CRUD", () => {
  it("creates, reads, updates, and deletes a show within the farm", async () => {
    const show = await createShow(agentA, { name: `CRUD Show ${suffix}` });

    // Listed for the farm.
    const list = await agentA.get("/api/shows");
    expect(list.status).toBe(200);
    expect((list.body as Array<{ id: number }>).map((s) => s.id)).toContain(show.id);

    // Detail includes an (empty) results array.
    const detail = await agentA.get(`/api/shows/${show.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.name).toBe(`CRUD Show ${suffix}`);
    expect(detail.body.results).toEqual([]);

    // Update the header; clearing location via null.
    const upd = await agentA
      .put(`/api/shows/${show.id}`)
      .send({ name: `Renamed Show ${suffix}`, location: null });
    expect(upd.status).toBe(200);
    expect(upd.body.name).toBe(`Renamed Show ${suffix}`);
    expect(upd.body.location).toBeNull();

    // Delete.
    const del = await agentA.delete(`/api/shows/${show.id}`);
    expect(del.status).toBe(204);
    const gone = await agentA.get(`/api/shows/${show.id}`);
    expect(gone.status).toBe(404);
  });

  it("rejects an invalid show body", async () => {
    const res = await agentA.post("/api/shows").send({ name: "", showDate: "not-a-date" });
    expect(res.status).toBe(400);
  });

  it("lists shows most recent show date first", async () => {
    const older = await createShow(agentA, {
      name: `Old Show ${suffix}`,
      showDate: "2025-01-10T12:00:00.000Z",
    });
    const newer = await createShow(agentA, {
      name: `New Show ${suffix}`,
      showDate: "2026-03-20T12:00:00.000Z",
    });

    const res = await agentA.get("/api/shows");
    expect(res.status).toBe(200);
    const ids = (res.body as Array<{ id: number }>).map((s) => s.id);
    expect(ids.indexOf(newer.id)).toBeLessThan(ids.indexOf(older.id));

    await agentA.delete(`/api/shows/${older.id}`);
    await agentA.delete(`/api/shows/${newer.id}`);
  });
});

describe("batch result creation", () => {
  it("creates a batch of results for the farm's goats", async () => {
    const show = await createShow(agentA, { name: `Batch Show ${suffix}` });
    const g1 = await createGoat(agentA, `Batch Goat 1 ${suffix}`);
    const g2 = await createGoat(agentA, `Batch Goat 2 ${suffix}`);

    const res = await agentA.post(`/api/shows/${show.id}/results`).send({
      results: [
        { goatId: g1, judgeName: "Judge Judy", classDivision: "Senior Doe", placement: "1st" },
        { goatId: g2, placement: "2nd", awardRibbon: "Blue" },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body).toHaveLength(2);

    const detail = await agentA.get(`/api/shows/${show.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.results).toHaveLength(2);
    const names = detail.body.results.map((r: { goatName: string }) => r.goatName);
    expect(names).toContain(`Batch Goat 1 ${suffix}`);
    expect(names).toContain(`Batch Goat 2 ${suffix}`);
  });

  it("rejects the whole batch when any goat belongs to another farm", async () => {
    const show = await createShow(agentA, { name: `Reject Show ${suffix}` });
    const goodGoat = await createGoat(agentA, `Good Goat ${suffix}`);
    const foreignGoat = await createGoat(agentB, `Foreign Goat ${suffix}`);

    const res = await agentA.post(`/api/shows/${show.id}/results`).send({
      results: [
        { goatId: goodGoat, placement: "1st" },
        { goatId: foreignGoat, placement: "2nd" },
      ],
    });
    expect(res.status).toBe(404);

    // No partial write: the show has zero result rows.
    const rows = await db
      .select()
      .from(showResultsTable)
      .where(eq(showResultsTable.showId, show.id));
    expect(rows).toHaveLength(0);
  });
});

describe("result update and delete", () => {
  it("updates and deletes an individual result row", async () => {
    const show = await createShow(agentA, { name: `Row Show ${suffix}` });
    const goat = await createGoat(agentA, `Row Goat ${suffix}`);
    const created = await agentA
      .post(`/api/shows/${show.id}/results`)
      .send({ results: [{ goatId: goat, placement: "3rd" }] });
    expect(created.status).toBe(201);
    const resultId = created.body[0].id as number;

    const upd = await agentA
      .put(`/api/shows/${show.id}/results/${resultId}`)
      .send({ placement: "1st", awardRibbon: "Grand Champion" });
    expect(upd.status).toBe(200);
    expect(upd.body.placement).toBe("1st");
    expect(upd.body.awardRibbon).toBe("Grand Champion");

    const del = await agentA.delete(`/api/shows/${show.id}/results/${resultId}`);
    expect(del.status).toBe(204);
    const delAgain = await agentA.delete(`/api/shows/${show.id}/results/${resultId}`);
    expect(delAgain.status).toBe(404);
  });
});

describe("delete-show cascade", () => {
  it("deleting a show removes its result rows too", async () => {
    const show = await createShow(agentA, { name: `Cascade Show ${suffix}` });
    const goat = await createGoat(agentA, `Cascade Goat ${suffix}`);
    const created = await agentA
      .post(`/api/shows/${show.id}/results`)
      .send({ results: [{ goatId: goat, placement: "1st" }] });
    expect(created.status).toBe(201);

    const del = await agentA.delete(`/api/shows/${show.id}`);
    expect(del.status).toBe(204);

    const rows = await db
      .select()
      .from(showResultsTable)
      .where(eq(showResultsTable.showId, show.id));
    expect(rows).toHaveLength(0);
  });
});

describe("goat accolades", () => {
  it("groups a goat's results by show, newest show first", async () => {
    const goat = await createGoat(agentA, `Accolade Goat ${suffix}`);
    const older = await createShow(agentA, {
      name: `Accolade Older ${suffix}`,
      showDate: "2025-05-01T12:00:00.000Z",
    });
    const newer = await createShow(agentA, {
      name: `Accolade Newer ${suffix}`,
      showDate: "2026-05-01T12:00:00.000Z",
    });

    // Two rows in the older show, one in the newer.
    const r1 = await agentA.post(`/api/shows/${older.id}/results`).send({
      results: [
        { goatId: goat, classDivision: "Junior Doe", placement: "2nd" },
        { goatId: goat, classDivision: "Best of Breed", placement: "1st" },
      ],
    });
    expect(r1.status).toBe(201);
    const r2 = await agentA
      .post(`/api/shows/${newer.id}/results`)
      .send({ results: [{ goatId: goat, placement: "1st" }] });
    expect(r2.status).toBe(201);

    const res = await agentA.get(`/api/goats/${goat}/accolades`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].show.id).toBe(newer.id);
    expect(res.body[0].results).toHaveLength(1);
    expect(res.body[1].show.id).toBe(older.id);
    expect(res.body[1].results).toHaveLength(2);
    // Rows within a show keep insertion (id) order.
    expect(res.body[1].results[0].classDivision).toBe("Junior Doe");
    expect(res.body[1].results[1].classDivision).toBe("Best of Breed");
  });

  it("404s for another farm's goat", async () => {
    const foreignGoat = await createGoat(agentB, `Accolade Foreign ${suffix}`);
    const res = await agentA.get(`/api/goats/${foreignGoat}/accolades`);
    expect(res.status).toBe(404);
  });
});

describe("farmhand read-only enforcement", () => {
  it("lets a farmhand read shows but blocks all mutations with 403", async () => {
    const show = await createShow(agentA, { name: `Hand Show ${suffix}` });
    const goat = await createGoat(agentA, `Hand Goat ${suffix}`);
    const created = await agentA
      .post(`/api/shows/${show.id}/results`)
      .send({ results: [{ goatId: goat, placement: "1st" }] });
    expect(created.status).toBe(201);
    const resultId = created.body[0].id as number;

    // Reads are allowed.
    const list = await handAgent.get("/api/shows");
    expect(list.status).toBe(200);
    const detail = await handAgent.get(`/api/shows/${show.id}`);
    expect(detail.status).toBe(200);
    const accolades = await handAgent.get(`/api/goats/${goat}/accolades`);
    expect(accolades.status).toBe(200);

    // Every mutation is forbidden.
    const post = await handAgent.post("/api/shows").send({
      name: "Hand Created",
      showDate: "2026-06-01T12:00:00.000Z",
    });
    expect(post.status).toBe(403);
    const put = await handAgent.put(`/api/shows/${show.id}`).send({ name: "Hijacked" });
    expect(put.status).toBe(403);
    const postResults = await handAgent
      .post(`/api/shows/${show.id}/results`)
      .send({ results: [{ goatId: goat, placement: "9th" }] });
    expect(postResults.status).toBe(403);
    const putResult = await handAgent
      .put(`/api/shows/${show.id}/results/${resultId}`)
      .send({ placement: "9th" });
    expect(putResult.status).toBe(403);
    const delResult = await handAgent.delete(`/api/shows/${show.id}/results/${resultId}`);
    expect(delResult.status).toBe(403);
    const delShow = await handAgent.delete(`/api/shows/${show.id}`);
    expect(delShow.status).toBe(403);

    // Nothing was mutated.
    const after = await agentA.get(`/api/shows/${show.id}`);
    expect(after.status).toBe(200);
    expect(after.body.name).toBe(`Hand Show ${suffix}`);
    expect(after.body.results).toHaveLength(1);
    expect(after.body.results[0].placement).toBe("1st");
  });
});

describe("cross-farm 404 isolation", () => {
  it("hides farm A's show and results from farm B entirely", async () => {
    const show = await createShow(agentA, { name: `Iso Show ${suffix}` });
    const goat = await createGoat(agentA, `Iso Goat ${suffix}`);
    const created = await agentA
      .post(`/api/shows/${show.id}/results`)
      .send({ results: [{ goatId: goat, placement: "1st" }] });
    expect(created.status).toBe(201);
    const resultId = created.body[0].id as number;

    // Not in farm B's list.
    const list = await agentB.get("/api/shows");
    expect(list.status).toBe(200);
    expect((list.body as Array<{ id: number }>).map((s) => s.id)).not.toContain(show.id);

    // Every direct access 404s for farm B.
    expect((await agentB.get(`/api/shows/${show.id}`)).status).toBe(404);
    expect((await agentB.put(`/api/shows/${show.id}`).send({ name: "Stolen" })).status).toBe(404);
    expect(
      (
        await agentB
          .post(`/api/shows/${show.id}/results`)
          .send({ results: [{ goatId: goat, placement: "1st" }] })
      ).status,
    ).toBe(404);
    expect(
      (await agentB.put(`/api/shows/${show.id}/results/${resultId}`).send({ placement: "9th" }))
        .status,
    ).toBe(404);
    expect((await agentB.delete(`/api/shows/${show.id}/results/${resultId}`)).status).toBe(404);
    expect((await agentB.delete(`/api/shows/${show.id}`)).status).toBe(404);

    // Farm A's data is untouched.
    const after = await agentA.get(`/api/shows/${show.id}`);
    expect(after.status).toBe(200);
    expect(after.body.name).toBe(`Iso Show ${suffix}`);
    expect(after.body.results).toHaveLength(1);
  });
});
