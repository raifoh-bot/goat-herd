import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request, { type Agent } from "supertest";
import { asc, eq, inArray } from "drizzle-orm";
import bcrypt from "bcrypt";
import { db, usersTable, farmSettingsTable } from "@workspace/db";
import app from "../app";
import { ensureFarmSettings } from "../lib/ensureFarmSettings";

// Integration tests for the farm-level "uses AI" setting. Reads are open to any
// authenticated user; writes are restricted to admin/owner. These run against the
// live database, so the single farm_settings row's original value is snapshotted
// up front and restored afterwards, and the seeded test users are removed.

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const ADMIN = { username: `settings-admin-${suffix}`, password: "admin-password-123" };
const OWNER = { username: `settings-owner-${suffix}`, password: "owner-password-123" };
const HAND = { username: `settings-hand-${suffix}`, password: "hand-password-123" };

const createdUserIds: number[] = [];
let originalUsesAi: boolean;
let settingsRowId: number;

async function seedUser(
  username: string,
  password: string,
  role: "admin" | "owner" | "farmhand",
) {
  const passwordHash = await bcrypt.hash(password, 10);
  const [user] = await db
    .insert(usersTable)
    .values({ username, passwordHash, role, active: true })
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
  // Guarantee the table and default row exist, then snapshot the current value.
  await ensureFarmSettings();
  const [row] = await db
    .select()
    .from(farmSettingsTable)
    .orderBy(asc(farmSettingsTable.id))
    .limit(1);
  settingsRowId = row.id;
  originalUsesAi = row.usesAi;

  await seedUser(ADMIN.username, ADMIN.password, "admin");
  await seedUser(OWNER.username, OWNER.password, "owner");
  await seedUser(HAND.username, HAND.password, "farmhand");
});

afterAll(async () => {
  // Restore the original setting value so this suite leaves no side effects.
  await db
    .update(farmSettingsTable)
    .set({ usesAi: originalUsesAi })
    .where(eq(farmSettingsTable.id, settingsRowId));

  if (createdUserIds.length > 0) {
    await db.delete(usersTable).where(inArray(usersTable.id, createdUserIds));
  }
  const { pool } = await import("@workspace/db");
  await pool.end();
});

describe("farm settings default row", () => {
  it("is seeded with uses_ai = true after boot", async () => {
    // Prove ensureFarmSettings provisions a default row with uses_ai = true on a
    // table with no rows. Empty the table in isolation, re-run the boot routine,
    // then assert exactly one row exists and its default is true. The afterAll
    // hook restores originalUsesAi onto whatever row id results.
    await db.delete(farmSettingsTable);

    await ensureFarmSettings();

    const rows = await db
      .select()
      .from(farmSettingsTable)
      .orderBy(asc(farmSettingsTable.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].usesAi).toBe(true);

    // Re-point the snapshot id so teardown restores the original value onto the
    // freshly seeded row.
    settingsRowId = rows[0].id;
  });
});

describe("GET /api/settings", () => {
  it("requires authentication", async () => {
    const res = await request(app).get("/api/settings");
    expect(res.status).toBe(401);
  });

  it("is readable by an admin", async () => {
    const agent = await login(ADMIN);
    const res = await agent.get("/api/settings");
    expect(res.status).toBe(200);
    expect(typeof res.body.usesAi).toBe("boolean");
    expect(res.body.id).toBe(settingsRowId);
  });

  it("is readable by a farm hand", async () => {
    const agent = await login(HAND);
    const res = await agent.get("/api/settings");
    expect(res.status).toBe(200);
    expect(typeof res.body.usesAi).toBe("boolean");
  });
});

describe("PUT /api/settings", () => {
  it("requires authentication", async () => {
    const res = await request(app).put("/api/settings").send({ usesAi: false });
    expect(res.status).toBe(401);
  });

  it("lets an admin toggle the setting off and on", async () => {
    const agent = await login(ADMIN);

    const off = await agent.put("/api/settings").send({ usesAi: false });
    expect(off.status).toBe(200);
    expect(off.body.usesAi).toBe(false);
    expect(off.body.id).toBe(settingsRowId);

    // The change persists across a fresh read.
    const readBack = await agent.get("/api/settings");
    expect(readBack.body.usesAi).toBe(false);

    const on = await agent.put("/api/settings").send({ usesAi: true });
    expect(on.status).toBe(200);
    expect(on.body.usesAi).toBe(true);
  });

  it("lets an owner toggle the setting", async () => {
    const agent = await login(OWNER);

    const off = await agent.put("/api/settings").send({ usesAi: false });
    expect(off.status).toBe(200);
    expect(off.body.usesAi).toBe(false);

    const on = await agent.put("/api/settings").send({ usesAi: true });
    expect(on.status).toBe(200);
    expect(on.body.usesAi).toBe(true);
  });

  it("forbids a farm hand from changing the setting", async () => {
    const agent = await login(HAND);
    const res = await agent.put("/api/settings").send({ usesAi: false });
    expect(res.status).toBe(403);
  });

  it("rejects a missing usesAi field", async () => {
    const agent = await login(ADMIN);
    const res = await agent.put("/api/settings").send({});
    expect(res.status).toBe(400);
  });

  it("rejects a non-boolean usesAi value", async () => {
    const agent = await login(ADMIN);
    const res = await agent.put("/api/settings").send({ usesAi: "yes" });
    expect(res.status).toBe(400);
  });
});
