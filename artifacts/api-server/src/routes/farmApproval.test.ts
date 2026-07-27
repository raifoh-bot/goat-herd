import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request, { type Agent } from "supertest";
import { and, eq, inArray, isNull } from "drizzle-orm";
import bcrypt from "bcrypt";
import { randomBytes } from "node:crypto";
import {
  db,
  usersTable,
  farmSettingsTable,
  farmsTable,
  farmApprovalTokensTable,
} from "@workspace/db";
import app from "../app";
import { ensureSessionTable } from "../lib/ensureSessionTable";
import { hashApprovalToken } from "./farms";

// End-to-end coverage for the super-admin approval flow for self-registered
// farms: registration creates a pending farm, login is gated until approval,
// the emailed one-click token approves exactly once, and the panel endpoints
// approve/reject with proper lifecycle rules. Runs against the live database;
// everything created here is torn down afterwards.

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const SUPERADMIN = { username: `apr-sa-${suffix}`, password: "superadmin-pass-123" };

const createdFarmIds: number[] = [];
const createdUserIds: number[] = [];

function uniqueSlug(prefix: string): string {
  return `${prefix}-${suffix}`;
}

function regBody(slug: string) {
  return {
    slug,
    farmName: "Approval Test Farm",
    username: "pending-admin",
    password: "pending-admin-1",
    email: "pending-admin@example.com",
  };
}

/** Registers a farm publicly and returns its id + slug (tracked for teardown). */
async function registerFarm(slugPrefix: string) {
  const slug = uniqueSlug(slugPrefix);
  const res = await request(app).post("/api/farms/register").send(regBody(slug));
  expect(res.status).toBe(201);
  createdFarmIds.push(res.body.id);
  return { id: res.body.id as number, slug, status: res.body.status as string };
}

/** Reads the (single) approval token row for a farm. */
async function tokenRowFor(farmId: number) {
  const rows = await db
    .select()
    .from(farmApprovalTokensTable)
    .where(eq(farmApprovalTokensTable.farmId, farmId));
  return rows;
}

/** Inserts a known raw token for a farm so the approve link can be exercised. */
async function seedToken(farmId: number, opts: { expired?: boolean } = {}) {
  const raw = randomBytes(32).toString("hex");
  await db.insert(farmApprovalTokensTable).values({
    farmId,
    tokenHash: hashApprovalToken(raw),
    expiresAt: new Date(Date.now() + (opts.expired ? -1000 : 60 * 60 * 1000)),
  });
  return raw;
}

async function loginSuperadmin(): Promise<Agent> {
  const agent = request.agent(app);
  const res = await agent.post("/api/auth/login").send(SUPERADMIN);
  expect(res.status).toBe(200);
  return agent;
}

beforeAll(async () => {
  await ensureSessionTable();
  const [existing] = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.username, SUPERADMIN.username), isNull(usersTable.farmId)));
  if (!existing) {
    const [sa] = await db
      .insert(usersTable)
      .values({
        farmId: null,
        username: SUPERADMIN.username,
        passwordHash: await bcrypt.hash(SUPERADMIN.password, 10),
        role: "superadmin",
        active: true,
      })
      .returning();
    createdUserIds.push(sa.id);
  }
});

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
  if (createdUserIds.length > 0) {
    await db.delete(usersTable).where(inArray(usersTable.id, createdUserIds));
  }
  const { pool } = await import("@workspace/db");
  await pool.end();
});

describe("public registration creates a pending farm", () => {
  it("returns status pending and stores an approval token (hashed)", async () => {
    const { id, status } = await registerFarm("pend");
    expect(status).toBe("pending");

    const [farm] = await db.select().from(farmsTable).where(eq(farmsTable.id, id));
    expect(farm.status).toBe("pending");

    // The fire-and-forget notification creates the token; give it a moment.
    await new Promise((r) => setTimeout(r, 300));
    const tokens = await tokenRowFor(id);
    expect(tokens.length).toBeGreaterThanOrEqual(1);
    // Only a 64-hex-char SHA-256 hash is stored, never a raw token.
    expect(tokens[0].tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(tokens[0].expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("blocks login to a pending farm with an awaiting-approval message", async () => {
    const { slug } = await registerFarm("gate");
    const res = await request(app)
      .post("/api/auth/login")
      .set("X-Farm-Slug", slug)
      .send({ username: "pending-admin", password: "pending-admin-1" });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/awaiting approval/i);
  });
});

describe("GET /api/farms/approve (one-click email link)", () => {
  it("approves the farm with a valid token, then rejects reuse", async () => {
    const { id, slug } = await registerFarm("link");
    const raw = await seedToken(id);

    const ok = await request(app).get(`/api/farms/approve?token=${raw}`);
    expect(ok.status).toBe(200);
    expect(ok.headers["content-type"]).toMatch(/html/);
    // No redirect: the link always lands on a same-origin page.
    expect(ok.headers.location).toBeUndefined();

    const [farm] = await db.select().from(farmsTable).where(eq(farmsTable.id, id));
    expect(farm.status).toBe("active");

    // The admin can now log in.
    const login = await request(app)
      .post("/api/auth/login")
      .set("X-Farm-Slug", slug)
      .send({ username: "pending-admin", password: "pending-admin-1" });
    expect(login.status).toBe(200);

    // Single-use: replaying the same link fails.
    const replay = await request(app).get(`/api/farms/approve?token=${raw}`);
    expect(replay.status).toBe(400);
  });

  it("rejects an expired token and leaves the farm pending", async () => {
    const { id } = await registerFarm("exp");
    const raw = await seedToken(id, { expired: true });
    const res = await request(app).get(`/api/farms/approve?token=${raw}`);
    expect(res.status).toBe(400);
    const [farm] = await db.select().from(farmsTable).where(eq(farmsTable.id, id));
    expect(farm.status).toBe("pending");
  });

  it("rejects a garbage token", async () => {
    const res = await request(app).get(`/api/farms/approve?token=not-a-real-token`);
    expect(res.status).toBe(400);
  });
});

describe("super-admin panel approve/reject", () => {
  it("approves a pending farm and invalidates outstanding tokens", async () => {
    const { id, slug } = await registerFarm("panel");
    const raw = await seedToken(id);
    const agent = await loginSuperadmin();

    const res = await agent.post(`/api/superadmin/farms/${id}/approve`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("active");

    // The emailed link is now dead.
    const replay = await request(app).get(`/api/farms/approve?token=${raw}`);
    expect(replay.status).toBe(400);

    // And approving twice conflicts.
    const again = await agent.post(`/api/superadmin/farms/${id}/approve`);
    expect(again.status).toBe(409);

    const login = await request(app)
      .post("/api/auth/login")
      .set("X-Farm-Slug", slug)
      .send({ username: "pending-admin", password: "pending-admin-1" });
    expect(login.status).toBe(200);
  });

  it("rejects a pending farm with a reason and blocks its login", async () => {
    const { id, slug } = await registerFarm("rej");
    const agent = await loginSuperadmin();

    const res = await agent
      .post(`/api/superadmin/farms/${id}/reject`)
      .send({ reason: "Spam signup" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("rejected");

    const [farm] = await db.select().from(farmsTable).where(eq(farmsTable.id, id));
    expect(farm.rejectedReason).toBe("Spam signup");
    expect(farm.rejectedAt).toBeTruthy();

    // Login (tenant resolution) is blocked with a distinct message.
    const login = await request(app)
      .post("/api/auth/login")
      .set("X-Farm-Slug", slug)
      .send({ username: "pending-admin", password: "pending-admin-1" });
    expect(login.status).toBe(403);
    expect(login.body.error).toMatch(/not approved/i);

    // A rejected farm can no longer be approved.
    const approve = await agent.post(`/api/superadmin/farms/${id}/approve`);
    expect(approve.status).toBe(409);

    // The rejected slug stays reserved: re-registering it conflicts.
    const rereg = await request(app).post("/api/farms/register").send(regBody(slug));
    expect(rereg.status).toBe(409);
  });

  it("requires a reason to reject and superadmin auth for both endpoints", async () => {
    const { id } = await registerFarm("authz");
    const agent = await loginSuperadmin();

    const noReason = await agent.post(`/api/superadmin/farms/${id}/reject`).send({});
    expect(noReason.status).toBe(400);

    const anonApprove = await request(app).post(`/api/superadmin/farms/${id}/approve`);
    expect(anonApprove.status).toBe(401);
    const anonReject = await request(app)
      .post(`/api/superadmin/farms/${id}/reject`)
      .send({ reason: "nope" });
    expect(anonReject.status).toBe(401);
  });

  it("blocks generic status updates on a pending farm", async () => {
    const { id } = await registerFarm("noput");
    const agent = await loginSuperadmin();
    const res = await agent.put(`/api/superadmin/farms/${id}`).send({ status: "active" });
    expect(res.status).toBe(409);
  });
});

describe("super-admin-created farms bypass approval", () => {
  it("creates an active farm whose admin can log in immediately", async () => {
    const agent = await loginSuperadmin();
    const slug = uniqueSlug("sa-direct");
    const res = await agent.post("/api/superadmin/farms").send({
      slug,
      name: "Direct Farm",
      adminUsername: "direct-admin",
      adminPassword: "direct-admin-1",
    });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("active");
    createdFarmIds.push(res.body.id);

    const login = await request(app)
      .post("/api/auth/login")
      .set("X-Farm-Slug", slug)
      .send({ username: "direct-admin", password: "direct-admin-1" });
    expect(login.status).toBe(200);

    // No approval token was ever issued for it.
    expect(await tokenRowFor(res.body.id)).toHaveLength(0);
  });
});
