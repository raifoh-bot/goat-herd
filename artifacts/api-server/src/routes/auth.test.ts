import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request, { type Agent } from "supertest";
import { eq, inArray } from "drizzle-orm";
import bcrypt from "bcrypt";
import { db, usersTable, goatsTable, farmsTable, passwordResetTokensTable } from "@workspace/db";
import app from "../app";
import { ensureSessionTable } from "../lib/ensureSessionTable";

// Exercises the authentication and role-enforcement layer end-to-end against the
// live database. Three users (admin, farmhand, deactivated) are seeded up front
// and removed afterwards.

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const ADMIN = { username: `auth-admin-${suffix}`, password: "admin-password-123" };
const HAND = { username: `auth-hand-${suffix}`, password: "hand-password-123" };
const INACTIVE = { username: `auth-inactive-${suffix}`, password: "inactive-password-123" };

const FARM_SLUG = "default";
let testFarmId: number;

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
    .values({ farmId: testFarmId, username, passwordHash, role, active })
    .returning();
  createdUserIds.push(user.id);
  return user;
}

async function login(creds: { username: string; password: string }): Promise<Agent> {
  const agent = request.agent(app);
  const res = await agent.post("/api/auth/login").set("X-Farm-Slug", FARM_SLUG).send(creds);
  expect(res.status).toBe(200);
  return agent;
}

beforeAll(async () => {
  await ensureSessionTable();
  const [defaultFarm] = await db
    .select()
    .from(farmsTable)
    .where(eq(farmsTable.slug, FARM_SLUG));
  expect(defaultFarm).toBeTruthy();
  testFarmId = defaultFarm.id;

  await seedUser(ADMIN.username, ADMIN.password, "admin");
  await seedUser(HAND.username, HAND.password, "farmhand");
  await seedUser(INACTIVE.username, INACTIVE.password, "admin", false);
});

afterAll(async () => {
  if (createdGoatIds.length > 0) {
    await db.delete(goatsTable).where(inArray(goatsTable.id, createdGoatIds));
  }
  if (createdUserIds.length > 0) {
    await db
      .delete(passwordResetTokensTable)
      .where(inArray(passwordResetTokensTable.userId, createdUserIds));
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
      .set("X-Farm-Slug", FARM_SLUG)
      .send({ username: ADMIN.username, password: "wrong" });
    expect(res.status).toBe(401);
  });

  it("rejects login for a deactivated user", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .set("X-Farm-Slug", FARM_SLUG)
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

  it("logs in a superadmin even when a farm context is present", async () => {
    const SA = { username: `auth-sa-${suffix}`, password: "superadmin-pass-123" };
    const passwordHash = await bcrypt.hash(SA.password, 10);
    const [sa] = await db
      .insert(usersTable)
      .values({ farmId: null, username: SA.username, passwordHash, role: "superadmin", active: true })
      .returning();
    createdUserIds.push(sa.id);

    // A stale farm slug (stored client-side or on the session) must not lock
    // the global superadmin out; the login falls back to the no-farm account.
    const res = await request(app)
      .post("/api/auth/login")
      .set("X-Farm-Slug", FARM_SLUG)
      .send(SA);
    expect(res.status).toBe(200);
    expect(res.body.role).toBe("superadmin");
    expect(res.body.farmSlug).toBeNull();

    // Wrong password must still be rejected via the fallback path.
    const bad = await request(app)
      .post("/api/auth/login")
      .set("X-Farm-Slug", FARM_SLUG)
      .send({ username: SA.username, password: "wrong-password" });
    expect(bad.status).toBe(401);
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

  it("rejects creating a user with a malformed email", async () => {
    const agent = await login(ADMIN);
    const res = await agent.post("/api/users").send({
      username: `auth-bademail-${suffix}`,
      password: "long-enough-pass-1",
      email: "notanemail",
      role: "farmhand",
    });
    expect(res.status).toBe(400);
  });

  it("rejects updating a user with a malformed email", async () => {
    const target = await seedUser(
      `auth-bademail-upd-${suffix}`,
      "original-password-1",
      "farmhand",
    );
    const agent = await login(ADMIN);
    const res = await agent
      .put(`/api/users/${target.id}`)
      .send({ email: "still-not-an-email" });
    expect(res.status).toBe(400);
  });
});

describe("admin password reset", () => {
  it("lets an admin reset another user's password", async () => {
    const target = await seedUser(
      `auth-reset-${suffix}`,
      "original-password-1",
      "farmhand",
    );
    const adminAgent = await login(ADMIN);
    const res = await adminAgent
      .put(`/api/users/${target.id}/password`)
      .send({ password: "brand-new-password-2" });
    expect(res.status).toBe(204);

    // Old password no longer works; new one does.
    const oldLogin = await request(app)
      .post("/api/auth/login")
      .set("X-Farm-Slug", FARM_SLUG)
      .send({ username: target.username, password: "original-password-1" });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(app)
      .post("/api/auth/login")
      .set("X-Farm-Slug", FARM_SLUG)
      .send({ username: target.username, password: "brand-new-password-2" });
    expect(newLogin.status).toBe(200);
  });

  it("rejects a password shorter than 8 characters", async () => {
    const target = await seedUser(
      `auth-reset-short-${suffix}`,
      "original-password-1",
      "farmhand",
    );
    const adminAgent = await login(ADMIN);
    const res = await adminAgent
      .put(`/api/users/${target.id}/password`)
      .send({ password: "short" });
    expect(res.status).toBe(400);
  });

  it("returns 404 for an unknown user", async () => {
    const adminAgent = await login(ADMIN);
    const res = await adminAgent
      .put("/api/users/99999999/password")
      .send({ password: "brand-new-password-2" });
    expect(res.status).toBe(404);
  });

  it("forbids a farm hand from resetting passwords", async () => {
    const target = await seedUser(
      `auth-reset-forbidden-${suffix}`,
      "original-password-1",
      "farmhand",
    );
    const handAgent = await login(HAND);
    const res = await handAgent
      .put(`/api/users/${target.id}/password`)
      .send({ password: "brand-new-password-2" });
    expect(res.status).toBe(403);
  });
});

describe("forgot / reset password", () => {
  async function latestTokenFor(userId: number): Promise<string> {
    const rows = await db
      .select()
      .from(passwordResetTokensTable)
      .where(eq(passwordResetTokensTable.userId, userId));
    expect(rows.length).toBeGreaterThan(0);
    return rows[rows.length - 1].token;
  }

  it("returns a neutral 200 for an unknown identifier without issuing a token", async () => {
    const res = await request(app)
      .post("/api/auth/forgot-password")
      .set("X-Farm-Slug", FARM_SLUG)
      .send({ identifier: `does-not-exist-${suffix}` });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/if an account matches/i);
  });

  it("issues a token for a user with an email, and completes the reset", async () => {
    const username = `auth-forgot-${suffix}`;
    const user = await seedUser(username, "old-password-1", "farmhand");
    await db
      .update(usersTable)
      .set({ email: `${username}@example.com` })
      .where(eq(usersTable.id, user.id));

    const res = await request(app)
      .post("/api/auth/forgot-password")
      .set("X-Farm-Slug", FARM_SLUG)
      .send({ identifier: `${username}@example.com` });
    expect(res.status).toBe(200);

    const token = await latestTokenFor(user.id);

    const reset = await request(app)
      .post("/api/auth/reset-password")
      .send({ token, newPassword: "fresh-password-2" });
    expect(reset.status).toBe(204);

    // New password works; old one doesn't.
    const oldLogin = await request(app)
      .post("/api/auth/login")
      .set("X-Farm-Slug", FARM_SLUG)
      .send({ username, password: "old-password-1" });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(app)
      .post("/api/auth/login")
      .set("X-Farm-Slug", FARM_SLUG)
      .send({ username, password: "fresh-password-2" });
    expect(newLogin.status).toBe(200);
  });

  it("does not issue a token for a user without an email on file", async () => {
    const username = `auth-forgot-noemail-${suffix}`;
    const user = await seedUser(username, "old-password-1", "farmhand");

    const res = await request(app)
      .post("/api/auth/forgot-password")
      .set("X-Farm-Slug", FARM_SLUG)
      .send({ identifier: username });
    expect(res.status).toBe(200);

    const rows = await db
      .select()
      .from(passwordResetTokensTable)
      .where(eq(passwordResetTokensTable.userId, user.id));
    expect(rows.length).toBe(0);
  });

  it("rejects reuse of a consumed token", async () => {
    const username = `auth-forgot-reuse-${suffix}`;
    const user = await seedUser(username, "old-password-1", "farmhand");
    await db
      .update(usersTable)
      .set({ email: `${username}@example.com` })
      .where(eq(usersTable.id, user.id));

    await request(app)
      .post("/api/auth/forgot-password")
      .set("X-Farm-Slug", FARM_SLUG)
      .send({ identifier: username });
    const token = await latestTokenFor(user.id);

    const first = await request(app)
      .post("/api/auth/reset-password")
      .send({ token, newPassword: "fresh-password-2" });
    expect(first.status).toBe(204);

    const second = await request(app)
      .post("/api/auth/reset-password")
      .send({ token, newPassword: "another-password-3" });
    expect(second.status).toBe(400);
  });

  it("rejects an expired token", async () => {
    const username = `auth-forgot-expired-${suffix}`;
    const user = await seedUser(username, "old-password-1", "farmhand");
    const [row] = await db
      .insert(passwordResetTokensTable)
      .values({
        userId: user.id,
        token: `expired-token-${suffix}`,
        expiresAt: new Date(Date.now() - 1000),
      })
      .returning();

    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: row.token, newPassword: "fresh-password-2" });
    expect(res.status).toBe(400);
  });

  it("rejects an invalid token", async () => {
    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: "not-a-real-token", newPassword: "fresh-password-2" });
    expect(res.status).toBe(400);
  });

  it("rejects a new password shorter than 8 characters", async () => {
    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: "whatever", newPassword: "short" });
    expect(res.status).toBe(400);
  });
});

describe("self-service password change", () => {
  it("lets a user change their own password", async () => {
    const username = `auth-self-${suffix}`;
    await seedUser(username, "first-password-1", "farmhand");
    const agent = await login({ username, password: "first-password-1" });

    const res = await agent
      .put("/api/auth/password")
      .send({ currentPassword: "first-password-1", newPassword: "second-password-2" });
    expect(res.status).toBe(204);

    const newLogin = await request(app)
      .post("/api/auth/login")
      .set("X-Farm-Slug", FARM_SLUG)
      .send({ username, password: "second-password-2" });
    expect(newLogin.status).toBe(200);
  });

  it("rejects an incorrect current password", async () => {
    const username = `auth-self-wrong-${suffix}`;
    await seedUser(username, "first-password-1", "farmhand");
    const agent = await login({ username, password: "first-password-1" });

    const res = await agent
      .put("/api/auth/password")
      .send({ currentPassword: "not-the-password", newPassword: "second-password-2" });
    expect(res.status).toBe(401);
  });

  it("rejects a new password shorter than 8 characters", async () => {
    const username = `auth-self-short-${suffix}`;
    await seedUser(username, "first-password-1", "farmhand");
    const agent = await login({ username, password: "first-password-1" });

    const res = await agent
      .put("/api/auth/password")
      .send({ currentPassword: "first-password-1", newPassword: "short" });
    expect(res.status).toBe(400);
  });

  it("requires authentication", async () => {
    const res = await request(app)
      .put("/api/auth/password")
      .send({ currentPassword: "first-password-1", newPassword: "second-password-2" });
    expect(res.status).toBe(401);
  });
});

describe("self-service email update", () => {
  it("lets a user without an email set one, and /auth/me reflects it", async () => {
    const username = `auth-email-${suffix}`;
    const user = await seedUser(username, "first-password-1", "farmhand");
    expect(user.email).toBeNull();
    const agent = await login({ username, password: "first-password-1" });

    const before = await agent.get("/api/auth/me");
    expect(before.status).toBe(200);
    expect(before.body.email).toBeNull();

    const res = await agent
      .put("/api/auth/email")
      .send({ email: "  farmhand@example.com  " });
    expect(res.status).toBe(200);
    expect(res.body.email).toBe("farmhand@example.com");

    const after = await agent.get("/api/auth/me");
    expect(after.body.email).toBe("farmhand@example.com");

    const [row] = await db.select().from(usersTable).where(eq(usersTable.id, user.id));
    expect(row.email).toBe("farmhand@example.com");
  });

  it("rejects a blank email", async () => {
    const username = `auth-email-blank-${suffix}`;
    await seedUser(username, "first-password-1", "farmhand");
    const agent = await login({ username, password: "first-password-1" });

    const res = await agent.put("/api/auth/email").send({ email: "   " });
    expect(res.status).toBe(400);
  });

  it("requires authentication", async () => {
    const res = await request(app)
      .put("/api/auth/email")
      .send({ email: "someone@example.com" });
    expect(res.status).toBe(401);
  });
});
