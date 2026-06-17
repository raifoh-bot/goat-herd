import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request, { type Agent } from "supertest";
import { eq, inArray } from "drizzle-orm";
import bcrypt from "bcrypt";
import { db, usersTable, goatsTable } from "@workspace/db";
import app from "../app";

// Exercises the authentication and role-enforcement layer end-to-end against the
// live database. Three users (admin, farmhand, deactivated) are seeded up front
// and removed afterwards.

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const ADMIN = { username: `auth-admin-${suffix}`, password: "admin-password-123" };
const HAND = { username: `auth-hand-${suffix}`, password: "hand-password-123" };
const INACTIVE = { username: `auth-inactive-${suffix}`, password: "inactive-password-123" };

const createdUserIds: number[] = [];
const createdGoatIds: number[] = [];

async function seedUser(
  username: string,
  password: string,
  role: "admin" | "owner" | "farmhand",
  active = true,
) {
  const passwordHash = await bcrypt.hash(password, 10);
  const [user] = await db
    .insert(usersTable)
    .values({ username, passwordHash, role, active })
    .returning();
  createdUserIds.push(user.id);
  return user;
}

async function login(creds: { username: string; password: string }): Promise<Agent> {
  const agent = request.agent(app);
  const res = await agent.post("/api/auth/login").send(creds);
  expect(res.status).toBe(200);
  return agent;
}

beforeAll(async () => {
  await seedUser(ADMIN.username, ADMIN.password, "admin");
  await seedUser(HAND.username, HAND.password, "farmhand");
  await seedUser(INACTIVE.username, INACTIVE.password, "admin", false);
});

afterAll(async () => {
  if (createdGoatIds.length > 0) {
    await db.delete(goatsTable).where(inArray(goatsTable.id, createdGoatIds));
  }
  if (createdUserIds.length > 0) {
    await db.delete(usersTable).where(inArray(usersTable.id, createdUserIds));
  }
  const { pool } = await import("@workspace/db");
  await pool.end();
});

describe("authentication", () => {
  it("rejects requests with no session", async () => {
    const res = await request(app).get("/api/goats");
    expect(res.status).toBe(401);
  });

  it("rejects invalid credentials", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: ADMIN.username, password: "wrong" });
    expect(res.status).toBe(401);
  });

  it("rejects login for a deactivated user", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: INACTIVE.username, password: INACTIVE.password });
    expect(res.status).toBe(401);
  });

  it("logs in, returns the current user, and logs out", async () => {
    const agent = await login(ADMIN);

    const me = await agent.get("/api/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.username).toBe(ADMIN.username);
    expect(me.body.role).toBe("admin");

    const out = await agent.post("/api/auth/logout");
    expect(out.status).toBe(204);

    const after = await agent.get("/api/auth/me");
    expect(after.status).toBe(401);
  });
});

describe("role enforcement", () => {
  it("allows an admin to create a goat", async () => {
    const agent = await login(ADMIN);
    const res = await agent
      .post("/api/goats")
      .send({ name: `Auth Test Goat ${suffix}`, sex: "doe", breed: "alpine" });
    expect(res.status).toBe(201);
    createdGoatIds.push(res.body.id);
  });

  it("forbids a farm hand from creating a goat", async () => {
    const agent = await login(HAND);
    const res = await agent
      .post("/api/goats")
      .send({ name: `Hand Goat ${suffix}`, sex: "doe", breed: "alpine" });
    expect(res.status).toBe(403);
  });

  it("forbids a farm hand from deleting a goat", async () => {
    const adminAgent = await login(ADMIN);
    const created = await adminAgent
      .post("/api/goats")
      .send({ name: `Deletable Goat ${suffix}`, sex: "doe", breed: "alpine" });
    expect(created.status).toBe(201);
    createdGoatIds.push(created.body.id);

    const handAgent = await login(HAND);
    const res = await handAgent.delete(`/api/goats/${created.body.id}`);
    expect(res.status).toBe(403);
  });

  it("allows a farm hand to read goats", async () => {
    const agent = await login(HAND);
    const res = await agent.get("/api/goats");
    expect(res.status).toBe(200);
  });

  it("forbids a farm hand from listing users", async () => {
    const agent = await login(HAND);
    const res = await agent.get("/api/users");
    expect(res.status).toBe(403);
  });

  it("allows an admin to list users", async () => {
    const agent = await login(ADMIN);
    const res = await agent.get("/api/users");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
