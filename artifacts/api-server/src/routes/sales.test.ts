import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import request, { type Agent } from "supertest";
import { eq } from "drizzle-orm";
import bcrypt from "bcrypt";
import { db, goatSalesTable, goatsTable, usersTable, farmsTable } from "@workspace/db";
import app from "../app";

// Integration tests for the goat sale endpoints: creating a sale must flip
// the goat's herd status, a goat may carry at most one sale record, and the
// sales log lists the farm's sales with the goat's name joined.

const createdGoatIds: number[] = [];

const TEST_USERNAME = `test-sales-admin-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const TEST_PASSWORD = "test-password-123";
const FARM_SLUG = "default";
let testUserId: number;
let agent: Agent;

async function createGoat(): Promise<number> {
  const res = await agent.post("/api/goats").send({
    name: `Sale Test Goat ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    breed: "alpine",
  });
  expect(res.status).toBe(201);
  const id = res.body.id as number;
  createdGoatIds.push(id);
  return id;
}

afterEach(async () => {
  for (const goatId of createdGoatIds) {
    await db.delete(goatSalesTable).where(eq(goatSalesTable.goatId, goatId));
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

  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
  const [user] = await db
    .insert(usersTable)
    .values({ farmId: defaultFarm.id, username: TEST_USERNAME, passwordHash, role: "admin", active: true })
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

describe("DELETE /api/goat-sales/:id", () => {
  it("deletes the sale and restores a still-sold goat to on-farm", async () => {
    const goatId = await createGoat();
    const createRes = await agent.post("/api/goat-sales").send({
      goatId,
      saleDate: "2026-07-05T12:00:00.000Z",
      buyerName: "Undo Buyer",
      registrationTransferred: true,
    });
    expect(createRes.status).toBe(201);

    const delRes = await agent.delete(`/api/goat-sales/${createRes.body.id}`);
    expect(delRes.status).toBe(204);

    const [goat] = await db.select().from(goatsTable).where(eq(goatsTable.id, goatId));
    expect(goat.herdStatus).toBe("on-farm");

    const saleRes = await agent.get(`/api/goats/${goatId}/sale`);
    expect(saleRes.status).toBe(200);
    expect(saleRes.body).toBeNull();
  });

  it("leaves a manually-changed herd status untouched when the sale is deleted", async () => {
    const goatId = await createGoat();
    const createRes = await agent.post("/api/goat-sales").send({
      goatId,
      saleDate: "2026-07-05T12:00:00.000Z",
      buyerName: "Undo Buyer",
      registrationTransferred: false,
    });
    expect(createRes.status).toBe(201);

    // The user already moved the goat to a non-sold status by hand.
    const putRes = await agent.put(`/api/goats/${goatId}`).send({ herdStatus: "leased" });
    expect(putRes.status).toBe(200);

    const delRes = await agent.delete(`/api/goat-sales/${createRes.body.id}`);
    expect(delRes.status).toBe(204);

    const [goat] = await db.select().from(goatsTable).where(eq(goatsTable.id, goatId));
    expect(goat.herdStatus).toBe("leased");
  });

  it("returns 404 for a sale record that does not exist", async () => {
    const res = await agent.delete("/api/goat-sales/999999");
    expect(res.status).toBe(404);
  });

  it("forbids non-manager roles from deleting a sale record", async () => {
    const goatId = await createGoat();
    const createRes = await agent.post("/api/goat-sales").send({
      goatId,
      saleDate: "2026-07-06T12:00:00.000Z",
      buyerName: "Role Test Buyer",
      registrationTransferred: false,
    });
    expect(createRes.status).toBe(201);

    const viewerUsername = `test-sales-viewer-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
    const [defaultFarm] = await db.select().from(farmsTable).where(eq(farmsTable.slug, FARM_SLUG));
    const [viewer] = await db
      .insert(usersTable)
      .values({ farmId: defaultFarm.id, username: viewerUsername, passwordHash, role: "farmhand", active: true })
      .returning();
    try {
      const viewerAgent = request.agent(app);
      const loginRes = await viewerAgent
        .post("/api/auth/login")
        .set("X-Farm-Slug", FARM_SLUG)
        .send({ username: viewerUsername, password: TEST_PASSWORD });
      expect(loginRes.status).toBe(200);

      const delRes = await viewerAgent.delete(`/api/goat-sales/${createRes.body.id}`);
      expect(delRes.status).toBe(403);

      // Record must still exist.
      const [sale] = await db
        .select()
        .from(goatSalesTable)
        .where(eq(goatSalesTable.id, createRes.body.id));
      expect(sale).toBeTruthy();
    } finally {
      await db.delete(usersTable).where(eq(usersTable.id, viewer.id));
    }
  });
});

describe("POST /api/goat-sales", () => {
  it("creates the sale and sets herdStatus to sold-registered when papers transferred", async () => {
    const goatId = await createGoat();

    const res = await agent.post("/api/goat-sales").send({
      goatId,
      saleDate: "2026-07-01T12:00:00.000Z",
      buyerName: "Jane Buyer",
      buyerContact: "jane@example.com",
      salePrice: 350,
      registrationTransferred: true,
      notes: "Picked up at the farm",
    });
    expect(res.status).toBe(201);
    expect(res.body.buyerName).toBe("Jane Buyer");
    expect(res.body.salePrice).toBe(350);

    const [goat] = await db.select().from(goatsTable).where(eq(goatsTable.id, goatId));
    expect(goat.herdStatus).toBe("sold-registered");
  });

  it("sets herdStatus to sold-not-registered when papers not transferred", async () => {
    const goatId = await createGoat();

    const res = await agent.post("/api/goat-sales").send({
      goatId,
      saleDate: "2026-07-02T12:00:00.000Z",
      buyerName: "Bob Buyer",
      registrationTransferred: false,
    });
    expect(res.status).toBe(201);

    const [goat] = await db.select().from(goatsTable).where(eq(goatsTable.id, goatId));
    expect(goat.herdStatus).toBe("sold-not-registered");
  });

  it("rejects a second sale record for the same goat", async () => {
    const goatId = await createGoat();

    const first = await agent.post("/api/goat-sales").send({
      goatId,
      saleDate: "2026-07-02T12:00:00.000Z",
      buyerName: "First Buyer",
      registrationTransferred: false,
    });
    expect(first.status).toBe(201);

    const second = await agent.post("/api/goat-sales").send({
      goatId,
      saleDate: "2026-07-03T12:00:00.000Z",
      buyerName: "Second Buyer",
      registrationTransferred: true,
    });
    expect(second.status).toBe(409);
  });

  it("404s for a goat that does not exist in the farm", async () => {
    const res = await agent.post("/api/goat-sales").send({
      goatId: 99999999,
      saleDate: "2026-07-02T12:00:00.000Z",
      buyerName: "Ghost Buyer",
      registrationTransferred: false,
    });
    expect(res.status).toBe(404);
  });
});

describe("GET /api/goat-sales and /api/goats/:id/sale", () => {
  it("lists the sale with the goat name joined and fetches the per-goat record", async () => {
    const goatId = await createGoat();
    await agent.post("/api/goat-sales").send({
      goatId,
      saleDate: "2026-07-05T12:00:00.000Z",
      buyerName: "List Buyer",
      salePrice: 120.5,
      registrationTransferred: false,
    });

    const listRes = await agent.get("/api/goat-sales");
    expect(listRes.status).toBe(200);
    const row = listRes.body.find((s: { goatId: number }) => s.goatId === goatId);
    expect(row).toBeTruthy();
    expect(row.goatName).toBeTruthy();
    expect(row.buyerName).toBe("List Buyer");

    const saleRes = await agent.get(`/api/goats/${goatId}/sale`);
    expect(saleRes.status).toBe(200);
    expect(saleRes.body.buyerName).toBe("List Buyer");
  });

  it("returns null for an unsold goat", async () => {
    const goatId = await createGoat();
    const res = await agent.get(`/api/goats/${goatId}/sale`);
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });
});

describe("PUT /api/goat-sales/:id", () => {
  it("updates the record and re-syncs the goat's sold status", async () => {
    const goatId = await createGoat();
    const createRes = await agent.post("/api/goat-sales").send({
      goatId,
      saleDate: "2026-07-06T12:00:00.000Z",
      buyerName: "Edit Buyer",
      registrationTransferred: false,
    });
    const saleId = createRes.body.id as number;

    const updateRes = await agent.put(`/api/goat-sales/${saleId}`).send({
      buyerName: "Edited Buyer",
      salePrice: 400,
      registrationTransferred: true,
    });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.buyerName).toBe("Edited Buyer");
    expect(updateRes.body.salePrice).toBe(400);

    const [goat] = await db.select().from(goatsTable).where(eq(goatsTable.id, goatId));
    expect(goat.herdStatus).toBe("sold-registered");
  });
});

describe("GET /api/goat-sales/export", () => {
  it("streams a CSV containing the sale row", async () => {
    const goatId = await createGoat();
    await agent.post("/api/goat-sales").send({
      goatId,
      saleDate: "2026-07-07T12:00:00.000Z",
      buyerName: "CSV Buyer",
      salePrice: 275,
      registrationTransferred: true,
    });

    const res = await agent.get("/api/goat-sales/export");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.text).toContain("CSV Buyer");
    expect(res.text).toContain("275");
  });
});

describe("DELETE /api/goats/:id with a sale record", () => {
  it("deletes the goat and its sale record together", async () => {
    const goatId = await createGoat();
    await agent.post("/api/goat-sales").send({
      goatId,
      saleDate: "2026-07-08T12:00:00.000Z",
      buyerName: "Delete Buyer",
      registrationTransferred: false,
    });

    const res = await agent.delete(`/api/goats/${goatId}`);
    expect(res.status).toBe(204);

    const sales = await db.select().from(goatSalesTable).where(eq(goatSalesTable.goatId, goatId));
    expect(sales).toHaveLength(0);
  });
});
