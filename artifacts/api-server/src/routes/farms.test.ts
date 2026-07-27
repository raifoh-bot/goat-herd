import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";
import {
  db,
  usersTable,
  farmSettingsTable,
  farmsTable,
  farmApprovalTokensTable,
  type Farm,
} from "@workspace/db";
import { RESERVED_SLUGS } from "@workspace/reserved-slugs";
import app from "../app";

// End-to-end coverage for the public self-service registration transaction
// (POST /api/farms/register). This is the single most important onboarding
// path: it must atomically create the farm, its settings row, and the first
// admin user. These tests run against the live database, so every farm created
// here is torn down afterwards (settings + users cascade off farmId).

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const createdFarmIds: number[] = [];

function uniqueSlug(prefix: string): string {
  // Slugs must be lowercase alnum + internal hyphens; the random suffix already
  // fits that shape.
  return `${prefix}-${suffix}`;
}

function validBody(overrides: Partial<Record<string, unknown>> = {}) {
  const slug = uniqueSlug("reg");
  return {
    slug,
    farmName: "Test Farm",
    username: "farm-admin",
    password: "super-secret-1",
    email: "farm-admin@example.com",
    ...overrides,
  };
}

async function trackFarm(slug: string): Promise<void> {
  const [farm] = await db.select().from(farmsTable).where(eq(farmsTable.slug, slug));
  if (farm) createdFarmIds.push(farm.id);
}

async function farmBySlug(slug: string): Promise<Farm | undefined> {
  const [farm] = await db.select().from(farmsTable).where(eq(farmsTable.slug, slug));
  return farm;
}

afterAll(async () => {
  if (createdFarmIds.length > 0) {
    await db
      .delete(farmApprovalTokensTable)
      .where(inArray(farmApprovalTokensTable.farmId, createdFarmIds));
    await db.delete(usersTable).where(inArray(usersTable.farmId, createdFarmIds));
    await db
      .delete(farmSettingsTable)
      .where(inArray(farmSettingsTable.farmId, createdFarmIds));
    await db.delete(farmsTable).where(inArray(farmsTable.id, createdFarmIds));
  }
  const { pool } = await import("@workspace/db");
  await pool.end();
});

describe("POST /api/farms/register", () => {
  it("creates the farm, its settings row, and the first admin user together", async () => {
    const body = validBody();
    const res = await request(app).post("/api/farms/register").send(body);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      slug: body.slug,
      name: body.farmName,
      // Self-registered farms await super-admin approval before going live.
      status: "pending",
    });
    expect(typeof res.body.id).toBe("number");
    createdFarmIds.push(res.body.id);

    const farmId = res.body.id as number;

    // Farm row exists.
    const [farm] = await db.select().from(farmsTable).where(eq(farmsTable.id, farmId));
    expect(farm).toBeTruthy();
    expect(farm.slug).toBe(body.slug);

    // Settings row was created for the farm, carrying the farm name.
    const [settings] = await db
      .select()
      .from(farmSettingsTable)
      .where(eq(farmSettingsTable.farmId, farmId));
    expect(settings).toBeTruthy();
    expect(settings.farmName).toBe(body.farmName);

    // Exactly one user, the first admin, was created for the farm.
    const users = await db.select().from(usersTable).where(eq(usersTable.farmId, farmId));
    expect(users).toHaveLength(1);
    expect(users[0].username).toBe(body.username);
    expect(users[0].role).toBe("admin");
    expect(users[0].active).toBe(true);
    // The password is stored hashed, never in plain text.
    expect(users[0].passwordHash).not.toBe(body.password);
  });

  it("blocks login until the farm is approved, then allows it", async () => {
    const body = validBody({ slug: uniqueSlug("login") });
    const reg = await request(app).post("/api/farms/register").send(body);
    expect(reg.status).toBe(201);
    createdFarmIds.push(reg.body.id);

    // Pending farm: tenant resolution blocks login with the awaiting message.
    const blocked = await request(app)
      .post("/api/auth/login")
      .set("X-Farm-Slug", body.slug)
      .send({ username: body.username, password: body.password });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error).toMatch(/awaiting approval/i);

    // Once approved (simulated directly), the admin can sign in normally.
    await db
      .update(farmsTable)
      .set({ status: "active" })
      .where(eq(farmsTable.id, reg.body.id));
    const login = await request(app)
      .post("/api/auth/login")
      .set("X-Farm-Slug", body.slug)
      .send({ username: body.username, password: body.password });
    expect(login.status).toBe(200);
  });

  it("rejects a duplicate slug with 409 and creates nothing new", async () => {
    const body = validBody({ slug: uniqueSlug("dup") });
    const first = await request(app).post("/api/farms/register").send(body);
    expect(first.status).toBe(201);
    createdFarmIds.push(first.body.id);

    const dup = await request(app)
      .post("/api/farms/register")
      .send({ ...body, farmName: "Another Farm", username: "other-admin" });
    expect(dup.status).toBe(409);

    // The original farm is untouched and no second farm exists for that slug.
    const farms = await db.select().from(farmsTable).where(eq(farmsTable.slug, body.slug));
    expect(farms).toHaveLength(1);
    expect(farms[0].id).toBe(first.body.id);

    // No user from the rejected attempt leaked in.
    const users = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.username, "other-admin"));
    expect(users).toHaveLength(0);
  });

  it("rejects reserved slugs (login, default, …) and creates nothing", async () => {
    // A username used only in these rejection attempts, so any leak is easy to
    // detect. Reserved words are refused at validation, before any DB write.
    const reservedUsername = `reserved-attempt-${suffix}`;

    for (const reserved of ["login", "default", "admin", "goats"]) {
      expect(RESERVED_SLUGS.has(reserved)).toBe(true);

      const res = await request(app)
        .post("/api/farms/register")
        .send(validBody({ slug: reserved, username: reservedUsername }));
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    }

    // No user (and therefore no farm/settings) was ever persisted for the
    // rejected attempts.
    const leaked = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.username, reservedUsername));
    expect(leaked).toHaveLength(0);
  });

  it("rejects a too-short password with 400 and creates nothing", async () => {
    const slug = uniqueSlug("shortpw");
    const res = await request(app)
      .post("/api/farms/register")
      .send(validBody({ slug, password: "short" }));
    expect(res.status).toBe(400);

    // No farm was created for that slug.
    expect(await farmBySlug(slug)).toBeUndefined();
    await trackFarm(slug); // defensive: track if one somehow leaked, for teardown
  });

  it("rejects a malformed email with 400 and creates nothing", async () => {
    const slug = uniqueSlug("bademail");
    const res = await request(app)
      .post("/api/farms/register")
      .send(validBody({ slug, email: "notanemail" }));
    expect(res.status).toBe(400);
    expect(await farmBySlug(slug)).toBeUndefined();
  });

  it("rejects a missing farm name with 400", async () => {
    const slug = uniqueSlug("noname");
    const res = await request(app)
      .post("/api/farms/register")
      .send(validBody({ slug, farmName: "" }));
    expect(res.status).toBe(400);
    expect(await farmBySlug(slug)).toBeUndefined();
  });
});
