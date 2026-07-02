import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request, { type Agent } from "supertest";
import { eq, inArray, isNull, and } from "drizzle-orm";
import bcrypt from "bcrypt";
import {
  db,
  usersTable,
  farmSettingsTable,
  farmsTable,
  type Farm,
} from "@workspace/db";
import { RESERVED_SLUGS } from "@workspace/reserved-slugs";
import app from "../app";
import { ensureSessionTable } from "../lib/ensureSessionTable";

// End-to-end coverage for the super-admin farm-management control panel
// (GET/POST/PUT /api/superadmin/farms). These are the operator endpoints for
// onboarding and suspending customer farms, so both the CRUD lifecycle and the
// role gating that guards it are exercised here. Tests run against the live
// database; every farm and user created here is torn down afterwards.

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const SUPERADMIN = { username: `sa-${suffix}`, password: "superadmin-pass-123" };
const FARM_ADMIN = { username: `fa-admin-${suffix}`, password: "farm-admin-pass-1" };
const FARM_HAND = { username: `fa-hand-${suffix}`, password: "farm-hand-pass-1" };
const EXISTING_FARM_SLUG = "default";

const createdFarmIds: number[] = [];
const createdUserIds: number[] = [];
let existingFarmId: number;

function uniqueSlug(prefix: string): string {
  return `${prefix}-${suffix}`;
}

function newFarmBody(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    slug: uniqueSlug("sa-farm"),
    name: "Superadmin Test Farm",
    adminUsername: "seed-admin",
    adminPassword: "seed-admin-pass-1",
    ...overrides,
  };
}

async function trackFarmBySlug(slug: string): Promise<void> {
  const [farm] = await db.select().from(farmsTable).where(eq(farmsTable.slug, slug));
  if (farm && !createdFarmIds.includes(farm.id)) createdFarmIds.push(farm.id);
}

/** Logs in the seeded platform super-admin (no farm context). */
async function loginSuperadmin(): Promise<Agent> {
  const agent = request.agent(app);
  const res = await agent.post("/api/auth/login").send(SUPERADMIN);
  expect(res.status).toBe(200);
  expect(res.body.role).toBe("superadmin");
  return agent;
}

/** Logs a farm-scoped user into the default farm. */
async function loginFarmUser(creds: { username: string; password: string }): Promise<Agent> {
  const agent = request.agent(app);
  const res = await agent
    .post("/api/auth/login")
    .set("X-Farm-Slug", EXISTING_FARM_SLUG)
    .send(creds);
  expect(res.status).toBe(200);
  return agent;
}

beforeAll(async () => {
  await ensureSessionTable();

  // Seed a platform super-admin (farm_id NULL). Idempotent: only insert if the
  // partial unique index (username WHERE farm_id IS NULL) has no row yet.
  const [existingSa] = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.username, SUPERADMIN.username), isNull(usersTable.farmId)));
  if (!existingSa) {
    const passwordHash = await bcrypt.hash(SUPERADMIN.password, 10);
    const [sa] = await db
      .insert(usersTable)
      .values({ farmId: null, username: SUPERADMIN.username, passwordHash, role: "superadmin", active: true })
      .returning();
    createdUserIds.push(sa.id);
  }

  // Seed farm-scoped admin + farmhand in the default farm to prove the role gate.
  const [defaultFarm] = await db
    .select()
    .from(farmsTable)
    .where(eq(farmsTable.slug, EXISTING_FARM_SLUG));
  expect(defaultFarm).toBeTruthy();
  existingFarmId = defaultFarm.id;

  const adminHash = await bcrypt.hash(FARM_ADMIN.password, 10);
  const [admin] = await db
    .insert(usersTable)
    .values({ farmId: existingFarmId, username: FARM_ADMIN.username, passwordHash: adminHash, role: "admin", active: true })
    .returning();
  createdUserIds.push(admin.id);

  const handHash = await bcrypt.hash(FARM_HAND.password, 10);
  const [hand] = await db
    .insert(usersTable)
    .values({ farmId: existingFarmId, username: FARM_HAND.username, passwordHash: handHash, role: "farmhand", active: true })
    .returning();
  createdUserIds.push(hand.id);
});

afterAll(async () => {
  // Remove users created within the farms this suite created (the API's
  // createFarm also seeds an admin per farm), then the settings and farms.
  if (createdFarmIds.length > 0) {
    await db.delete(usersTable).where(inArray(usersTable.farmId, createdFarmIds));
    await db.delete(farmSettingsTable).where(inArray(farmSettingsTable.farmId, createdFarmIds));
  }
  if (createdUserIds.length > 0) {
    await db.delete(usersTable).where(inArray(usersTable.id, createdUserIds));
  }
  if (createdFarmIds.length > 0) {
    await db.delete(farmsTable).where(inArray(farmsTable.id, createdFarmIds));
  }
  const { pool } = await import("@workspace/db");
  await pool.end();
});

describe("super-admin farm management: role gating", () => {
  it("rejects an unauthenticated request with 401", async () => {
    const res = await request(app).get("/api/superadmin/farms");
    expect(res.status).toBe(401);
  });

  it("forbids a farm admin from listing farms with 403", async () => {
    const agent = await loginFarmUser(FARM_ADMIN);
    const res = await agent.get("/api/superadmin/farms");
    expect(res.status).toBe(403);
  });

  it("forbids a farm hand from listing farms with 403", async () => {
    const agent = await loginFarmUser(FARM_HAND);
    const res = await agent.get("/api/superadmin/farms");
    expect(res.status).toBe(403);
  });

  it("forbids a farm admin from creating a farm with 403", async () => {
    const agent = await loginFarmUser(FARM_ADMIN);
    const slug = uniqueSlug("forbidden-create");
    const res = await agent.post("/api/superadmin/farms").send(newFarmBody({ slug }));
    expect(res.status).toBe(403);
    // Nothing was created for that slug.
    const [farm] = await db.select().from(farmsTable).where(eq(farmsTable.slug, slug));
    expect(farm).toBeUndefined();
  });
});

describe("super-admin farm management: lifecycle", () => {
  it("lists farms including the pre-existing default farm", async () => {
    const agent = await loginSuperadmin();
    const res = await agent.get("/api/superadmin/farms");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const slugs = (res.body as Farm[]).map((f) => f.slug);
    expect(slugs).toContain(EXISTING_FARM_SLUG);
    // Enriched shape carries the per-farm counts.
    const defaultRow = (res.body as Array<Record<string, unknown>>).find(
      (f) => f.slug === EXISTING_FARM_SLUG,
    );
    expect(defaultRow).toBeDefined();
    expect(typeof defaultRow!.userCount).toBe("number");
    expect(typeof defaultRow!.goatCount).toBe("number");
    expect(typeof defaultRow!.breedingCount).toBe("number");
  });

  it("creates a farm together with its settings row and admin user", async () => {
    const agent = await loginSuperadmin();
    const body = newFarmBody({ slug: uniqueSlug("create") });
    const res = await agent.post("/api/superadmin/farms").send(body);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ slug: body.slug, name: body.name, status: "active" });
    expect(typeof res.body.id).toBe("number");
    createdFarmIds.push(res.body.id);
    const farmId = res.body.id as number;

    // Settings row created for the farm.
    const [settings] = await db
      .select()
      .from(farmSettingsTable)
      .where(eq(farmSettingsTable.farmId, farmId));
    expect(settings).toBeTruthy();

    // Exactly one admin user was seeded for the farm.
    const users = await db.select().from(usersTable).where(eq(usersTable.farmId, farmId));
    expect(users).toHaveLength(1);
    expect(users[0].username).toBe(body.adminUsername);
    expect(users[0].role).toBe("admin");
  });

  it("updates a farm's name", async () => {
    const agent = await loginSuperadmin();
    const created = await agent.post("/api/superadmin/farms").send(newFarmBody({ slug: uniqueSlug("rename") }));
    expect(created.status).toBe(201);
    createdFarmIds.push(created.body.id);

    const res = await agent
      .put(`/api/superadmin/farms/${created.body.id}`)
      .send({ name: "Renamed Farm" });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Renamed Farm");

    const [farm] = await db.select().from(farmsTable).where(eq(farmsTable.id, created.body.id));
    expect(farm.name).toBe("Renamed Farm");
  });

  it("suspends and reactivates a farm", async () => {
    const agent = await loginSuperadmin();
    const created = await agent.post("/api/superadmin/farms").send(newFarmBody({ slug: uniqueSlug("toggle") }));
    expect(created.status).toBe(201);
    createdFarmIds.push(created.body.id);
    const farmId = created.body.id as number;

    const suspend = await agent.put(`/api/superadmin/farms/${farmId}`).send({ status: "suspended" });
    expect(suspend.status).toBe(200);
    expect(suspend.body.status).toBe("suspended");
    const [afterSuspend] = await db.select().from(farmsTable).where(eq(farmsTable.id, farmId));
    expect(afterSuspend.status).toBe("suspended");

    const reactivate = await agent.put(`/api/superadmin/farms/${farmId}`).send({ status: "active" });
    expect(reactivate.status).toBe(200);
    expect(reactivate.body.status).toBe("active");
    const [afterReactivate] = await db.select().from(farmsTable).where(eq(farmsTable.id, farmId));
    expect(afterReactivate.status).toBe("active");
  });

  it("returns 404 when updating an unknown farm", async () => {
    const agent = await loginSuperadmin();
    const res = await agent.put("/api/superadmin/farms/99999999").send({ status: "suspended" });
    expect(res.status).toBe(404);
  });
});

describe("super-admin farm management: rejected creations", () => {
  it("rejects a duplicate slug with 409 and creates nothing new", async () => {
    const agent = await loginSuperadmin();
    const body = newFarmBody({ slug: uniqueSlug("dup") });
    const first = await agent.post("/api/superadmin/farms").send(body);
    expect(first.status).toBe(201);
    createdFarmIds.push(first.body.id);

    const dup = await agent
      .post("/api/superadmin/farms")
      .send({ ...body, name: "Another Farm", adminUsername: "other-admin" });
    expect(dup.status).toBe(409);

    // Only the original farm exists for that slug, and no leaked user.
    const farms = await db.select().from(farmsTable).where(eq(farmsTable.slug, body.slug));
    expect(farms).toHaveLength(1);
    expect(farms[0].id).toBe(first.body.id);
    const leaked = await db.select().from(usersTable).where(eq(usersTable.username, "other-admin"));
    expect(leaked).toHaveLength(0);
  });

  it("rejects a reserved slug with 400 and creates nothing", async () => {
    const agent = await loginSuperadmin();
    const reserved = "admin";
    expect(RESERVED_SLUGS.has(reserved)).toBe(true);

    const res = await agent.post("/api/superadmin/farms").send(newFarmBody({ slug: reserved }));
    expect(res.status).toBe(400);

    // The reserved word never became a farm.
    const [farm] = await db.select().from(farmsTable).where(eq(farmsTable.slug, reserved));
    expect(farm).toBeUndefined();
    await trackFarmBySlug(reserved); // defensive teardown if one somehow leaked
  });

  it("rejects a too-short admin password with 400 and creates nothing", async () => {
    const agent = await loginSuperadmin();
    const slug = uniqueSlug("shortpw");
    const res = await agent
      .post("/api/superadmin/farms")
      .send(newFarmBody({ slug, adminPassword: "short" }));
    expect(res.status).toBe(400);
    const [farm] = await db.select().from(farmsTable).where(eq(farmsTable.slug, slug));
    expect(farm).toBeUndefined();
  });
});

describe("super-admin farm management: suspension blocks login", () => {
  it("prevents a suspended farm's members from logging in", async () => {
    const agent = await loginSuperadmin();
    const body = newFarmBody({ slug: uniqueSlug("susplogin") });
    const created = await agent.post("/api/superadmin/farms").send(body);
    expect(created.status).toBe(201);
    createdFarmIds.push(created.body.id);

    // The seeded admin can log in while the farm is active.
    const before = await request(app)
      .post("/api/auth/login")
      .set("X-Farm-Slug", body.slug)
      .send({ username: body.adminUsername, password: body.adminPassword });
    expect(before.status).toBe(200);

    // Suspend the farm.
    const suspend = await agent.put(`/api/superadmin/farms/${created.body.id}`).send({ status: "suspended" });
    expect(suspend.status).toBe(200);

    // Now the same member is blocked at tenant resolution.
    const after = await request(app)
      .post("/api/auth/login")
      .set("X-Farm-Slug", body.slug)
      .send({ username: body.adminUsername, password: body.adminPassword });
    expect(after.status).toBe(403);
  });
});
