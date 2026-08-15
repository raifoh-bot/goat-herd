import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import request, { type Agent } from "supertest";
import { eq } from "drizzle-orm";
import bcrypt from "bcrypt";
import { db, goatsTable, breedingsTable, kidsTable, usersTable, semenStrawsTable, farmsTable, pregnancyTestsTable, breedingEventsTable } from "@workspace/db";
import app from "../app";

// These integration tests exercise the doe lactation-status side effects driven by
// the breeding workflow (PUT /breedings/:id and POST /breedings/:id/kids). They run
// against the live database, so every created row is tracked and removed afterwards.
// All API routes require authentication, so the suite logs in as a seeded admin
// user and issues every request through the resulting cookie-bearing agent.

const createdGoatIds: number[] = [];
const createdBreedingIds: number[] = [];
const createdStrawIds: number[] = [];

const TEST_USERNAME = `test-admin-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const TEST_PASSWORD = "test-password-123";
const TEST_FARM_SLUG = "default";
let testUserId: number;
let testFarmId: number;
let agent: Agent;

async function createDoe(status: "exposed" | "serviced" | "pregnant" | "dry" | "milking" = "exposed") {
  // Breeding-related statuses live on breedingStatus; lactation ones on lactationStatus.
  const isBreedingStatus = status === "exposed" || status === "serviced" || status === "pregnant";
  const [doe] = await db
    .insert(goatsTable)
    .values({
      farmId: testFarmId,
      name: `Test Doe ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      sex: "doe",
      breed: "alpine",
      lactationStatus: isBreedingStatus ? null : status,
      breedingStatus: isBreedingStatus ? status : null,
    })
    .returning();
  createdGoatIds.push(doe.id);
  return doe;
}

async function createBreeding(doeId: number, status: "bred" | "confirmed-pregnant" | "open" | "kidded" = "bred") {
  const [breeding] = await db
    .insert(breedingsTable)
    .values({
      farmId: testFarmId,
      doeId,
      sireName: "Test Sire",
      breedingMethod: "natural",
      breedingDate: new Date(),
      status,
    })
    .returning();
  createdBreedingIds.push(breeding.id);
  return breeding;
}

async function createStraw(pedigree?: {
  sireDamName?: string;
  sireSireName?: string;
}) {
  const [straw] = await db
    .insert(semenStrawsTable)
    .values({
      farmId: testFarmId,
      sireName: `Test AI Sire ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      count: 5,
      sireDamName: pedigree?.sireDamName ?? null,
      sireSireName: pedigree?.sireSireName ?? null,
    })
    .returning();
  createdStrawIds.push(straw.id);
  return straw;
}

async function createAiBreeding(doeId: number, sireName: string, semenStrawId: number | null) {
  const [breeding] = await db
    .insert(breedingsTable)
    .values({
      farmId: testFarmId,
      doeId,
      sireName,
      breedingMethod: "ai",
      semenStrawId,
      breedingDate: new Date(),
      status: "confirmed-pregnant",
    })
    .returning();
  createdBreedingIds.push(breeding.id);
  return breeding;
}

async function getDoe(id: number) {
  const [doe] = await db.select().from(goatsTable).where(eq(goatsTable.id, id));
  return doe;
}

afterEach(async () => {
  // Remove any kids created off tracked breedings, then breedings, then goats.
  for (const breedingId of createdBreedingIds) {
    // Recording kids can auto-create herd goat records; remove those too so no
    // orphaned rows survive the test.
    const kids = await db.select().from(kidsTable).where(eq(kidsTable.breedingId, breedingId));
    await db.delete(kidsTable).where(eq(kidsTable.breedingId, breedingId));
    for (const kid of kids) {
      if (kid.goatId != null) await db.delete(goatsTable).where(eq(goatsTable.id, kid.goatId));
    }
    // Pregnancy tests and breeding events FK-reference the breeding; clear both
    // before removing the breeding itself.
    await db.delete(pregnancyTestsTable).where(eq(pregnancyTestsTable.breedingId, breedingId));
    await db.delete(breedingEventsTable).where(eq(breedingEventsTable.breedingId, breedingId));
    await db.delete(breedingsTable).where(eq(breedingsTable.id, breedingId));
  }
  createdBreedingIds.length = 0;

  for (const strawId of createdStrawIds) {
    await db.delete(semenStrawsTable).where(eq(semenStrawsTable.id, strawId));
  }
  createdStrawIds.length = 0;

  for (const goatId of createdGoatIds) {
    await db.delete(goatsTable).where(eq(goatsTable.id, goatId));
  }
  createdGoatIds.length = 0;
});

beforeAll(async () => {
  // The default farm is created by the boot migration (ensureMultiTenant). All
  // test data is scoped to it.
  const [defaultFarm] = await db
    .select()
    .from(farmsTable)
    .where(eq(farmsTable.slug, TEST_FARM_SLUG));
  expect(defaultFarm).toBeTruthy();
  testFarmId = defaultFarm.id;

  // Seed an admin user in the default farm and log in so the cookie-bearing
  // agent can reach the authentication-gated breeding endpoints.
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
  const [user] = await db
    .insert(usersTable)
    .values({ farmId: testFarmId, username: TEST_USERNAME, passwordHash, role: "admin", active: true })
    .returning();
  testUserId = user.id;

  agent = request.agent(app);
  // The login request carries X-Farm-Slug so the tenant middleware can resolve
  // the farm; the session then remembers it for subsequent requests.
  const loginRes = await agent
    .post("/api/auth/login")
    .set("X-Farm-Slug", TEST_FARM_SLUG)
    .send({ username: TEST_USERNAME, password: TEST_PASSWORD });
  expect(loginRes.status).toBe(200);
});

afterAll(async () => {
  // Remove the seeded test user, then drain pooled connections.
  await db.delete(usersTable).where(eq(usersTable.id, testUserId));
  const { pool } = await import("@workspace/db");
  await pool.end();
});

describe("PUT /api/breedings/:id doe status transitions", () => {
  it("confirming a pregnancy sets the doe's breedingStatus to 'pregnant'", async () => {
    const doe = await createDoe("exposed");
    const breeding = await createBreeding(doe.id, "bred");

    const res = await agent
      .put(`/api/breedings/${breeding.id}`)
      .send({ status: "confirmed-pregnant" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("confirmed-pregnant");

    const updatedDoe = await getDoe(doe.id);
    expect(updatedDoe.breedingStatus).toBe("pregnant");
  });

  it("does not re-fire the pregnant transition on a repeat save", async () => {
    const doe = await createDoe("exposed");
    const breeding = await createBreeding(doe.id, "bred");

    // First confirm: should set the doe to pregnant.
    await agent.put(`/api/breedings/${breeding.id}`).send({ status: "confirmed-pregnant" });
    expect((await getDoe(doe.id)).breedingStatus).toBe("pregnant");

    // Simulate the doe's status drifting away from "pregnant" (e.g. another workflow).
    await db.update(goatsTable).set({ breedingStatus: "exposed" }).where(eq(goatsTable.id, doe.id));

    // Saving "confirmed-pregnant" again should NOT re-fire the transition, because the
    // breeding is already in that status.
    const res = await agent
      .put(`/api/breedings/${breeding.id}`)
      .send({ status: "confirmed-pregnant", notes: "second save" });

    expect(res.status).toBe(200);
    const doeAfter = await getDoe(doe.id);
    expect(doeAfter.breedingStatus).toBe("exposed");
  });

  it("reopening a breeding clears the doe's breeding status", async () => {
    const doe = await createDoe("pregnant");
    const breeding = await createBreeding(doe.id, "confirmed-pregnant");

    const res = await agent
      .put(`/api/breedings/${breeding.id}`)
      .send({ status: "open" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("open");

    const updatedDoe = await getDoe(doe.id);
    expect(updatedDoe.breedingStatus).toBeNull();
  });

  it("reopening a breeding does not change the doe's lactation status", async () => {
    const doe = await createDoe("milking");
    const breeding = await createBreeding(doe.id, "bred");

    await agent.put(`/api/breedings/${breeding.id}`).send({ status: "open" });

    const updatedDoe = await getDoe(doe.id);
    expect(updatedDoe.lactationStatus).toBe("milking");
    expect(updatedDoe.breedingStatus).toBeNull();
  });
});

describe("POST /api/breedings/:id/kids doe status transition", () => {
  it("recording kids sets the doe to 'milking'", async () => {
    const doe = await createDoe("pregnant");
    const breeding = await createBreeding(doe.id, "confirmed-pregnant");

    const res = await agent
      .post(`/api/breedings/${breeding.id}/kids`)
      .send({
        birthDate: new Date().toISOString(),
        // Skip auto-adding herd records so the test leaves no orphaned goat rows.
        skipHerdAdd: true,
        kids: [
          { sex: "doe", kidStatus: "alive" },
          { sex: "buck", kidStatus: "alive" },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveLength(2);

    const updatedDoe = await getDoe(doe.id);
    expect(updatedDoe.lactationStatus).toBe("milking");
    expect(updatedDoe.breedingStatus).toBeNull();

    const [updatedBreeding] = await db
      .select()
      .from(breedingsTable)
      .where(eq(breedingsTable.id, breeding.id));
    expect(updatedBreeding.status).toBe("kidded");
  });

  it("accepts 'aborted' as a kid outcome and stores it", async () => {
    const doe = await createDoe("pregnant");
    const breeding = await createBreeding(doe.id, "confirmed-pregnant");

    const res = await agent
      .post(`/api/breedings/${breeding.id}/kids`)
      .send({
        birthDate: new Date().toISOString(),
        skipHerdAdd: true,
        kids: [{ sex: "doe", kidStatus: "aborted" }],
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].kidStatus).toBe("aborted");

    const storedKids = await db
      .select()
      .from(kidsTable)
      .where(eq(kidsTable.breedingId, breeding.id));
    expect(storedKids).toHaveLength(1);
    expect(storedKids[0].kidStatus).toBe("aborted");
  });
});

describe("POST /api/breedings/:id/kids paternal pedigree inheritance", () => {
  it("AI kidding inherits paternal grandparents from the linked semen straw", async () => {
    const doe = await createDoe("pregnant");
    const straw = await createStraw({ sireDamName: "Sire's Dam", sireSireName: "Sire's Sire" });
    const breeding = await createAiBreeding(doe.id, straw.sireName, straw.id);

    const res = await agent
      .post(`/api/breedings/${breeding.id}/kids`)
      .send({
        birthDate: new Date().toISOString(),
        kids: [{ name: "AI Kid", sex: "doe", kidStatus: "alive" }],
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveLength(1);
    const goatId = res.body[0].goatId;
    expect(goatId).toBeTruthy();

    const [kidGoat] = await db.select().from(goatsTable).where(eq(goatsTable.id, goatId));
    expect(kidGoat.paternalGranddamName).toBe("Sire's Dam");
    expect(kidGoat.paternalGrandsireName).toBe("Sire's Sire");
    // Maternal grandparents still come from the doe.
    expect(kidGoat.maternalGranddamName).toBe(doe.damName ?? "");
    expect(kidGoat.maternalGrandsireName).toBe(doe.sireName ?? "");
  });

  it("AI kidding with no linked straw leaves paternal grandparents blank", async () => {
    const doe = await createDoe("pregnant");
    const breeding = await createAiBreeding(doe.id, "Unlinked AI Sire", null);

    const res = await agent
      .post(`/api/breedings/${breeding.id}/kids`)
      .send({
        birthDate: new Date().toISOString(),
        kids: [{ name: "AI Kid No Straw", sex: "buck", kidStatus: "alive" }],
      });

    expect(res.status).toBe(201);
    const goatId = res.body[0].goatId;
    const [kidGoat] = await db.select().from(goatsTable).where(eq(goatsTable.id, goatId));
    expect(kidGoat.paternalGranddamName).toBe("");
    expect(kidGoat.paternalGrandsireName).toBe("");
  });

  it("natural-service kidding leaves paternal grandparents blank", async () => {
    const doe = await createDoe("pregnant");
    const breeding = await createBreeding(doe.id, "confirmed-pregnant");

    const res = await agent
      .post(`/api/breedings/${breeding.id}/kids`)
      .send({
        birthDate: new Date().toISOString(),
        kids: [{ name: "Natural Kid", sex: "doe", kidStatus: "alive" }],
      });

    expect(res.status).toBe(201);
    const goatId = res.body[0].goatId;
    const [kidGoat] = await db.select().from(goatsTable).where(eq(goatsTable.id, goatId));
    expect(kidGoat.paternalGranddamName).toBe("");
    expect(kidGoat.paternalGrandsireName).toBe("");
  });
});

describe("POST /api/breedings/import", () => {
  it("imports a breeding for an existing doe and sets the doe's lactation status", async () => {
    const doe = await createDoe("dry");

    const res = await agent.post("/api/breedings/import").send({
      breedings: [
        {
          doeName: doe.name,
          sireName: "Imported Buck",
          breedingMethod: "natural",
          breedingDate: new Date().toISOString(),
          status: "bred",
          notes: "From spreadsheet",
        },
      ],
    });

    expect(res.status).toBe(201);
    expect(res.body.imported).toBe(1);
    expect(res.body.skipped).toBe(0);

    const inserted = await db
      .select()
      .from(breedingsTable)
      .where(eq(breedingsTable.doeId, doe.id));
    expect(inserted).toHaveLength(1);
    inserted.forEach((b) => createdBreedingIds.push(b.id));
    expect(inserted[0].sireName).toBe("Imported Buck");

    // status "bred" + natural method => doe becomes "exposed".
    expect((await getDoe(doe.id)).breedingStatus).toBe("exposed");
  });

  it("defaults a blank sire to 'Unknown' and AI bred does to 'serviced'", async () => {
    const doe = await createDoe("dry");

    const res = await agent.post("/api/breedings/import").send({
      breedings: [
        {
          doeName: doe.name,
          breedingMethod: "ai",
          breedingDate: new Date().toISOString(),
          status: "bred",
        },
      ],
    });

    expect(res.status).toBe(201);
    expect(res.body.imported).toBe(1);

    const inserted = await db
      .select()
      .from(breedingsTable)
      .where(eq(breedingsTable.doeId, doe.id));
    inserted.forEach((b) => createdBreedingIds.push(b.id));
    expect(inserted[0].sireName).toBe("Unknown");
    expect((await getDoe(doe.id)).breedingStatus).toBe("serviced");
  });

  it("skips rows whose doe is not in the herd with a clear error", async () => {
    const res = await agent.post("/api/breedings/import").send({
      breedings: [
        {
          doeName: "Nonexistent Doe XYZ",
          breedingDate: new Date().toISOString(),
        },
      ],
    });

    expect(res.status).toBe(201);
    expect(res.body.imported).toBe(0);
    expect(res.body.skipped).toBe(1);
    expect(res.body.errors[0]).toContain("Nonexistent Doe XYZ");
  });

  it("matches the doe name case-insensitively", async () => {
    const doe = await createDoe("dry");

    const res = await agent.post("/api/breedings/import").send({
      breedings: [
        { doeName: doe.name.toUpperCase(), breedingDate: new Date().toISOString() },
      ],
    });

    expect(res.status).toBe(201);
    expect(res.body.imported).toBe(1);

    const inserted = await db
      .select()
      .from(breedingsTable)
      .where(eq(breedingsTable.doeId, doe.id));
    inserted.forEach((b) => createdBreedingIds.push(b.id));
    expect(inserted).toHaveLength(1);
  });
});

describe("POST /api/kids/import", () => {
  it("imports a kid by matching the doe name + breeding date", async () => {
    const doe = await createDoe("pregnant");
    const breedingDate = new Date("2026-01-15T00:00:00.000Z");
    const [breeding] = await db
      .insert(breedingsTable)
      .values({
        farmId: testFarmId,
        doeId: doe.id,
        sireName: "Sire",
        breedingMethod: "natural",
        breedingDate,
        status: "kidded",
      })
      .returning();
    createdBreedingIds.push(breeding.id);

    const res = await agent.post("/api/kids/import").send({
      kids: [
        {
          doeName: doe.name,
          breedingDate: breedingDate.toISOString(),
          name: "Imported Kid",
          sex: "doe",
          kidStatus: "alive",
          birthWeight: 3.2,
        },
      ],
    });

    expect(res.status).toBe(201);
    expect(res.body.imported).toBe(1);
    expect(res.body.skipped).toBe(0);

    const kids = await db
      .select()
      .from(kidsTable)
      .where(eq(kidsTable.breedingId, breeding.id));
    expect(kids).toHaveLength(1);
    expect(kids[0].name).toBe("Imported Kid");
    expect(kids[0].sex).toBe("doe");
    expect(kids[0].birthWeight).toBe(3.2);
  });

  it("skips a kid when no breeding matches the doe + date", async () => {
    const doe = await createDoe("pregnant");
    const breeding = await createBreeding(doe.id, "kidded");
    // breeding above is dated 'now'; query a clearly different day.

    const res = await agent.post("/api/kids/import").send({
      kids: [
        {
          doeName: doe.name,
          breedingDate: new Date("2020-06-01T00:00:00.000Z").toISOString(),
          sex: "buck",
        },
      ],
    });

    expect(res.status).toBe(201);
    expect(res.body.imported).toBe(0);
    expect(res.body.skipped).toBe(1);
    expect(res.body.errors[0]).toContain(doe.name);

    const kids = await db
      .select()
      .from(kidsTable)
      .where(eq(kidsTable.breedingId, breeding.id));
    expect(kids).toHaveLength(0);
  });

  it("picks the most recent breeding when several match the same day", async () => {
    const doe = await createDoe("pregnant");
    const breedingDate = new Date("2026-02-20T00:00:00.000Z");

    const [older] = await db
      .insert(breedingsTable)
      .values({
        farmId: testFarmId,
        doeId: doe.id,
        sireName: "Older",
        breedingMethod: "natural",
        breedingDate,
        createdAt: new Date("2026-02-20T08:00:00.000Z"),
        status: "kidded",
      })
      .returning();
    createdBreedingIds.push(older.id);

    const [newer] = await db
      .insert(breedingsTable)
      .values({
        farmId: testFarmId,
        doeId: doe.id,
        sireName: "Newer",
        breedingMethod: "natural",
        breedingDate,
        createdAt: new Date("2026-02-20T20:00:00.000Z"),
        status: "kidded",
      })
      .returning();
    createdBreedingIds.push(newer.id);

    const res = await agent.post("/api/kids/import").send({
      kids: [
        { doeName: doe.name, breedingDate: breedingDate.toISOString(), sex: "doe" },
      ],
    });

    expect(res.status).toBe(201);
    expect(res.body.imported).toBe(1);

    // The most recent breeding by breedingDate ordering should receive the kid.
    const newerKids = await db
      .select()
      .from(kidsTable)
      .where(eq(kidsTable.breedingId, newer.id));
    expect(newerKids).toHaveLength(1);
  });
});

describe("POST /api/breedings/:id/pregnancy-tests", () => {
  it("records a test without side effects when no flags are set", async () => {
    const doe = await createDoe("serviced");
    const breeding = await createBreeding(doe.id, "bred");

    const res = await agent
      .post(`/api/breedings/${breeding.id}/pregnancy-tests`)
      .send({
        testDate: new Date().toISOString(),
        method: "ultrasound",
        result: "inconclusive",
        testedBy: "Dr. Vet",
        notes: "Too early to tell",
      });

    expect(res.status).toBe(201);
    expect(res.body.pregnancyTests).toHaveLength(1);
    expect(res.body.pregnancyTests[0].result).toBe("inconclusive");
    expect(res.body.pregnancyTests[0].method).toBe("ultrasound");
    expect(res.body.pregnancyTests[0].testedBy).toBe("Dr. Vet");
    // Breeding + doe unchanged.
    expect(res.body.status).toBe("bred");
    const stored = await getDoe(doe.id);
    expect(stored.breedingStatus).toBe("serviced");
  });

  it("confirms the pregnancy on a positive result when confirmPregnancy is set", async () => {
    const doe = await createDoe("serviced");
    const breeding = await createBreeding(doe.id, "bred");

    const res = await agent
      .post(`/api/breedings/${breeding.id}/pregnancy-tests`)
      .send({
        testDate: new Date().toISOString(),
        method: "blood",
        result: "positive",
        confirmPregnancy: true,
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("confirmed-pregnant");
    const stored = await getDoe(doe.id);
    expect(stored.breedingStatus).toBe("pregnant");
  });

  it("marks the doe open and logs a final cover on a negative result", async () => {
    const doe = await createDoe("pregnant");
    const breeding = await createBreeding(doe.id, "confirmed-pregnant");

    const res = await agent
      .post(`/api/breedings/${breeding.id}/pregnancy-tests`)
      .send({
        testDate: new Date().toISOString(),
        method: "palpation",
        result: "negative",
        markOpen: true,
        addCoverEvent: { eventDate: new Date().toISOString(), notes: "Final cover attempt" },
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("open");
    expect(res.body.pregnancyTests).toHaveLength(1);
    const coverEvents = (res.body.events ?? []).filter((e: { eventType: string }) => e.eventType === "cover");
    expect(coverEvents).toHaveLength(1);
    const stored = await getDoe(doe.id);
    expect(stored.breedingStatus).toBeNull();
  });

  it("returns 404 for a breeding in another farm's scope", async () => {
    const res = await agent
      .post(`/api/breedings/99999999/pregnancy-tests`)
      .send({ testDate: new Date().toISOString(), method: "ultrasound", result: "positive" });

    expect(res.status).toBe(404);
  });

  it("rejects an invalid method", async () => {
    const doe = await createDoe();
    const breeding = await createBreeding(doe.id, "bred");

    const res = await agent
      .post(`/api/breedings/${breeding.id}/pregnancy-tests`)
      .send({ testDate: new Date().toISOString(), method: "xray", result: "positive" });

    expect(res.status).toBe(400);
  });
});

describe("pregnancy tests vs. manual status edits stay consistent", () => {
  it("a confirming positive test re-confirms a doe after a manual reopen, leaving breeding and doe in agreement", async () => {
    const doe = await createDoe("pregnant");
    const breeding = await createBreeding(doe.id, "confirmed-pregnant");

    // Manual edit: reopen the breeding. This clears the doe's breeding status.
    const reopenRes = await agent
      .put(`/api/breedings/${breeding.id}`)
      .send({ status: "open" });
    expect(reopenRes.status).toBe(200);
    expect(reopenRes.body.status).toBe("open");
    expect((await getDoe(doe.id)).breedingStatus).toBeNull();

    // A later positive test that confirms the pregnancy must bring both the
    // breeding and the doe back into a consistent confirmed-pregnant state —
    // the manual reopen is not silently left in place.
    const testRes = await agent
      .post(`/api/breedings/${breeding.id}/pregnancy-tests`)
      .send({
        testDate: new Date().toISOString(),
        method: "ultrasound",
        result: "positive",
        confirmPregnancy: true,
      });

    expect(testRes.status).toBe(201);
    expect(testRes.body.status).toBe("confirmed-pregnant");
    expect(testRes.body.doe.breedingStatus).toBe("pregnant");
    expect((await getDoe(doe.id)).breedingStatus).toBe("pregnant");
  });

  it("logging a plain test on a kidded breeding does not regress the doe or overwrite the kidding outcome", async () => {
    const doe = await createDoe("milking");
    const breeding = await createBreeding(doe.id, "kidded");

    // Record the kidding outcome so we can assert it survives the later test.
    const [kid] = await db
      .insert(kidsTable)
      .values({
        farmId: testFarmId,
        breedingId: breeding.id,
        name: "Existing Kid",
        sex: "doe",
        kidStatus: "alive",
        birthDate: new Date(),
      })
      .returning();

    // A pregnancy test recorded (e.g. mistakenly) against an already-kidded
    // breeding must not roll the doe back off "milking" or reopen the breeding.
    const res = await agent
      .post(`/api/breedings/${breeding.id}/pregnancy-tests`)
      .send({
        testDate: new Date().toISOString(),
        method: "palpation",
        result: "inconclusive",
        notes: "Recorded against a closed breeding",
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("kidded");
    expect(res.body.doe.lactationStatus).toBe("milking");
    expect((await getDoe(doe.id)).lactationStatus).toBe("milking");

    // The kidding outcome (the kid record) is untouched.
    const kidsAfter = await db
      .select()
      .from(kidsTable)
      .where(eq(kidsTable.breedingId, breeding.id));
    expect(kidsAfter).toHaveLength(1);
    expect(kidsAfter[0].id).toBe(kid.id);
  });
});

describe("breeding responses resolve the doe's default photo", () => {
  it("uses the newest photo for the doe when no default is set", async () => {
    const doe = await createDoe();
    await db
      .update(goatsTable)
      .set({ imageUrls: ["/api/storage/objects/a.jpg", "/api/storage/objects/b.jpg"] })
      .where(eq(goatsTable.id, doe.id));
    const breeding = await createBreeding(doe.id);

    const listRes = await agent.get("/api/breedings");
    expect(listRes.status).toBe(200);
    const listed = (listRes.body as Array<{ id: number; doe: { imageUrl: string | null } }>).find(
      (b) => b.id === breeding.id,
    );
    expect(listed?.doe.imageUrl).toBe("/api/storage/objects/b.jpg");

    const detailRes = await agent.get(`/api/breedings/${breeding.id}`);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.doe.imageUrl).toBe("/api/storage/objects/b.jpg");
  });

  it("uses the chosen default photo for the doe when one is set", async () => {
    const doe = await createDoe();
    await db
      .update(goatsTable)
      .set({
        imageUrls: ["/api/storage/objects/a.jpg", "/api/storage/objects/b.jpg"],
        defaultPhotoIndex: 0,
      })
      .where(eq(goatsTable.id, doe.id));
    const breeding = await createBreeding(doe.id);

    const detailRes = await agent.get(`/api/breedings/${breeding.id}`);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.doe.imageUrl).toBe("/api/storage/objects/a.jpg");
  });
});

// Insert a pregnancy test directly, scoped to a breeding, returning its row.
async function createPregnancyTest(
  breedingId: number,
  overrides: Partial<{ method: string; result: string; testedBy: string | null; notes: string | null; testDate: Date }> = {},
) {
  const [test] = await db
    .insert(pregnancyTestsTable)
    .values({
      farmId: testFarmId,
      breedingId,
      testDate: overrides.testDate ?? new Date(),
      method: (overrides.method ?? "ultrasound") as "ultrasound" | "blood" | "palpation" | "other",
      result: (overrides.result ?? "inconclusive") as "positive" | "negative" | "inconclusive",
      testedBy: overrides.testedBy ?? null,
      notes: overrides.notes ?? null,
    })
    .returning();
  return test;
}

describe("PUT /api/breedings/:id/pregnancy-tests/:testId", () => {
  it("corrects the date, method, result, tester, and notes", async () => {
    const doe = await createDoe("serviced");
    const breeding = await createBreeding(doe.id, "bred");
    const test = await createPregnancyTest(breeding.id, { method: "ultrasound", result: "inconclusive", testedBy: "Typo" });

    const newDate = new Date("2026-01-15T12:00:00.000Z");
    const res = await agent
      .put(`/api/breedings/${breeding.id}/pregnancy-tests/${test.id}`)
      .send({
        testDate: newDate.toISOString(),
        method: "blood",
        result: "positive",
        testedBy: "Dr. Fixed",
        notes: "Corrected entry",
      });

    expect(res.status).toBe(200);
    expect(res.body.method).toBe("blood");
    expect(res.body.result).toBe("positive");
    expect(res.body.testedBy).toBe("Dr. Fixed");
    expect(res.body.notes).toBe("Corrected entry");
    expect(new Date(res.body.testDate).toISOString()).toBe(newDate.toISOString());
  });

  it("does not change breeding or doe status even when the result is edited", async () => {
    const doe = await createDoe("serviced");
    const breeding = await createBreeding(doe.id, "bred");
    const test = await createPregnancyTest(breeding.id, { result: "inconclusive" });

    const res = await agent
      .put(`/api/breedings/${breeding.id}/pregnancy-tests/${test.id}`)
      .send({ result: "positive" });

    expect(res.status).toBe(200);
    const [storedBreeding] = await db.select().from(breedingsTable).where(eq(breedingsTable.id, breeding.id));
    expect(storedBreeding.status).toBe("bred");
    const storedDoe = await getDoe(doe.id);
    expect(storedDoe.breedingStatus).toBe("serviced");
  });

  it("clears optional fields when passed null", async () => {
    const doe = await createDoe();
    const breeding = await createBreeding(doe.id, "bred");
    const test = await createPregnancyTest(breeding.id, { testedBy: "Someone", notes: "old note" });

    const res = await agent
      .put(`/api/breedings/${breeding.id}/pregnancy-tests/${test.id}`)
      .send({ testedBy: null, notes: null });

    expect(res.status).toBe(200);
    expect(res.body.testedBy).toBeNull();
    expect(res.body.notes).toBeNull();
  });

  it("returns 404 when the test does not belong to the breeding", async () => {
    const doe = await createDoe();
    const breeding = await createBreeding(doe.id, "bred");
    const otherBreeding = await createBreeding(doe.id, "bred");
    const test = await createPregnancyTest(otherBreeding.id);

    const res = await agent
      .put(`/api/breedings/${breeding.id}/pregnancy-tests/${test.id}`)
      .send({ result: "positive" });

    expect(res.status).toBe(404);
  });

  it("rejects an invalid method", async () => {
    const doe = await createDoe();
    const breeding = await createBreeding(doe.id, "bred");
    const test = await createPregnancyTest(breeding.id);

    const res = await agent
      .put(`/api/breedings/${breeding.id}/pregnancy-tests/${test.id}`)
      .send({ method: "xray" });

    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/breedings/:id/pregnancy-tests/:testId", () => {
  it("removes the test", async () => {
    const doe = await createDoe();
    const breeding = await createBreeding(doe.id, "bred");
    const test = await createPregnancyTest(breeding.id);

    const res = await agent.delete(`/api/breedings/${breeding.id}/pregnancy-tests/${test.id}`);

    expect(res.status).toBe(204);
    const remaining = await db.select().from(pregnancyTestsTable).where(eq(pregnancyTestsTable.id, test.id));
    expect(remaining).toHaveLength(0);
  });

  it("returns 404 when the test does not belong to the breeding", async () => {
    const doe = await createDoe();
    const breeding = await createBreeding(doe.id, "bred");
    const otherBreeding = await createBreeding(doe.id, "bred");
    const test = await createPregnancyTest(otherBreeding.id);

    const res = await agent.delete(`/api/breedings/${breeding.id}/pregnancy-tests/${test.id}`);

    expect(res.status).toBe(404);
    // The test still exists (afterEach cleans it up via otherBreeding).
    const remaining = await db.select().from(pregnancyTestsTable).where(eq(pregnancyTestsTable.id, test.id));
    expect(remaining).toHaveLength(1);
  });

  it("forbids a farmhand from deleting a test", async () => {
    const doe = await createDoe();
    const breeding = await createBreeding(doe.id, "bred");
    const test = await createPregnancyTest(breeding.id);

    const farmhandUsername = `test-farmhand-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const farmhandPassword = "farmhand-password-123";
    const passwordHash = await bcrypt.hash(farmhandPassword, 10);
    const [farmhand] = await db
      .insert(usersTable)
      .values({ farmId: testFarmId, username: farmhandUsername, passwordHash, role: "farmhand", active: true })
      .returning();

    try {
      const farmhandAgent = request.agent(app);
      const loginRes = await farmhandAgent
        .post("/api/auth/login")
        .set("X-Farm-Slug", TEST_FARM_SLUG)
        .send({ username: farmhandUsername, password: farmhandPassword });
      expect(loginRes.status).toBe(200);

      const res = await farmhandAgent.delete(`/api/breedings/${breeding.id}/pregnancy-tests/${test.id}`);
      expect(res.status).toBe(403);
      // The test survives the forbidden delete.
      const remaining = await db.select().from(pregnancyTestsTable).where(eq(pregnancyTestsTable.id, test.id));
      expect(remaining).toHaveLength(1);
    } finally {
      await db.delete(usersTable).where(eq(usersTable.id, farmhand.id));
    }
  });
});
