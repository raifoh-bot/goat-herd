import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request, { type Agent } from "supertest";
import { eq, inArray } from "drizzle-orm";
import bcrypt from "bcrypt";
import { db, usersTable, farmsTable } from "@workspace/db";
import app from "../app";
import { ensureSessionTable } from "../lib/ensureSessionTable";

// Covers the fullName field on the admin user-management entry paths:
// POST /api/users (create with / without a name) and PUT /api/users/:id
// (omitting fullName leaves it unchanged; blank or null clears it). The
// self-service PUT /auth/name path is covered in auth.test.ts.

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const ADMIN = { username: `users-admin-${suffix}`, password: "admin-password-123" };

const FARM_SLUG = "default";
let testFarmId: number;
let admin: Agent;

const createdUserIds: number[] = [];

beforeAll(async () => {
  await ensureSessionTable();
  const [defaultFarm] = await db.select().from(farmsTable).where(eq(farmsTable.slug, FARM_SLUG));
  expect(defaultFarm).toBeTruthy();
  testFarmId = defaultFarm.id;

  const passwordHash = await bcrypt.hash(ADMIN.password, 10);
  const [user] = await db
    .insert(usersTable)
    .values({ farmId: testFarmId, username: ADMIN.username, passwordHash, role: "admin" })
    .returning();
  createdUserIds.push(user.id);

  admin = request.agent(app);
  const res = await admin
    .post("/api/auth/login")
    .set("X-Farm-Slug", FARM_SLUG)
    .send(ADMIN);
  expect(res.status).toBe(200);
});

afterAll(async () => {
  if (createdUserIds.length > 0) {
    await db.delete(usersTable).where(inArray(usersTable.id, createdUserIds));
  }
  const { pool } = await import("@workspace/db");
  await pool.end();
});

function createBody(overrides: Partial<Record<string, unknown>> = {}) {
  const username = `users-t-${Math.random().toString(36).slice(2, 8)}-${suffix}`;
  return {
    username,
    password: "farmhand-pass-1",
    email: `${username}@example.com`,
    role: "farmhand",
    ...overrides,
  };
}

async function createUser(overrides: Partial<Record<string, unknown>> = {}) {
  const res = await admin.post("/api/users").send(createBody(overrides));
  expect(res.status).toBe(201);
  createdUserIds.push(res.body.id);
  return res.body as { id: number; fullName: string | null };
}

async function fullNameInDb(id: number): Promise<string | null> {
  const [row] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  return row.fullName;
}

describe("POST /api/users fullName", () => {
  it("persists a trimmed fullName when provided", async () => {
    const user = await createUser({ fullName: "  Bob Wrangler  " });
    expect(user.fullName).toBe("Bob Wrangler");
    expect(await fullNameInDb(user.id)).toBe("Bob Wrangler");
  });

  it("stores null when fullName is omitted", async () => {
    const user = await createUser();
    expect(user.fullName).toBeNull();
    expect(await fullNameInDb(user.id)).toBeNull();
  });

  it("stores null when fullName is blank", async () => {
    const user = await createUser({ fullName: "   " });
    expect(user.fullName).toBeNull();
    expect(await fullNameInDb(user.id)).toBeNull();
  });
});

describe("PUT /api/users/:id fullName", () => {
  it("updates the name when a non-blank fullName is sent", async () => {
    const user = await createUser({ fullName: "Original Name" });
    const res = await admin.put(`/api/users/${user.id}`).send({ fullName: "  New Name  " });
    expect(res.status).toBe(200);
    expect(res.body.fullName).toBe("New Name");
    expect(await fullNameInDb(user.id)).toBe("New Name");
  });

  it("leaves the name unchanged when fullName is omitted", async () => {
    const user = await createUser({ fullName: "Keep Me" });
    // Update an unrelated field only; the name must survive.
    const res = await admin.put(`/api/users/${user.id}`).send({ role: "admin" });
    expect(res.status).toBe(200);
    expect(res.body.fullName).toBe("Keep Me");
    expect(await fullNameInDb(user.id)).toBe("Keep Me");
  });

  it("clears the name when fullName is blank", async () => {
    const user = await createUser({ fullName: "Blank Me" });
    const res = await admin.put(`/api/users/${user.id}`).send({ fullName: "   " });
    expect(res.status).toBe(200);
    expect(res.body.fullName).toBeNull();
    expect(await fullNameInDb(user.id)).toBeNull();
  });

  it("clears the name when fullName is null", async () => {
    const user = await createUser({ fullName: "Null Me" });
    const res = await admin.put(`/api/users/${user.id}`).send({ fullName: null });
    expect(res.status).toBe(200);
    expect(res.body.fullName).toBeNull();
    expect(await fullNameInDb(user.id)).toBeNull();
  });
});
