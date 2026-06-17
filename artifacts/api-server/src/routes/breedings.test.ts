import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { db, goatsTable, breedingsTable, kidsTable } from "@workspace/db";
import app from "../app";

// These integration tests exercise the doe lactation-status side effects driven by
// the breeding workflow (PUT /breedings/:id and POST /breedings/:id/kids). They run
// against the live database, so every created row is tracked and removed afterwards.

const createdGoatIds: number[] = [];
const createdBreedingIds: number[] = [];

async function createDoe(lactationStatus: "exposed" | "serviced" | "pregnant" | "dry" | "milking" = "exposed") {
  const [doe] = await db
    .insert(goatsTable)
    .values({
      name: `Test Doe ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      sex: "doe",
      breed: "alpine",
      lactationStatus,
    })
    .returning();
  createdGoatIds.push(doe.id);
  return doe;
}

async function createBreeding(doeId: number, status: "bred" | "confirmed-pregnant" | "open" | "kidded" = "bred") {
  const [breeding] = await db
    .insert(breedingsTable)
    .values({
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

async function getDoe(id: number) {
  const [doe] = await db.select().from(goatsTable).where(eq(goatsTable.id, id));
  return doe;
}

afterEach(async () => {
  // Remove any kids created off tracked breedings, then breedings, then goats.
  for (const breedingId of createdBreedingIds) {
    await db.delete(kidsTable).where(eq(kidsTable.breedingId, breedingId));
    await db.delete(breedingsTable).where(eq(breedingsTable.id, breedingId));
  }
  createdBreedingIds.length = 0;

  for (const goatId of createdGoatIds) {
    await db.delete(goatsTable).where(eq(goatsTable.id, goatId));
  }
  createdGoatIds.length = 0;
});

beforeAll(() => {
  // Capture any goats auto-created as herd records when kids are recorded so we can
  // clean them up. We diff the goats table around the kid-recording test instead.
});

afterAll(async () => {
  // Drain any pooled connections so the test process exits cleanly.
  const { pool } = await import("@workspace/db");
  await pool.end();
});

describe("PUT /api/breedings/:id doe status transitions", () => {
  it("confirming a pregnancy sets the doe's lactationStatus to 'pregnant'", async () => {
    const doe = await createDoe("exposed");
    const breeding = await createBreeding(doe.id, "bred");

    const res = await request(app)
      .put(`/api/breedings/${breeding.id}`)
      .send({ status: "confirmed-pregnant" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("confirmed-pregnant");

    const updatedDoe = await getDoe(doe.id);
    expect(updatedDoe.lactationStatus).toBe("pregnant");
  });

  it("does not re-fire the pregnant transition on a repeat save", async () => {
    const doe = await createDoe("exposed");
    const breeding = await createBreeding(doe.id, "bred");

    // First confirm: should set the doe to pregnant.
    await request(app).put(`/api/breedings/${breeding.id}`).send({ status: "confirmed-pregnant" });
    expect((await getDoe(doe.id)).lactationStatus).toBe("pregnant");

    // Simulate the doe's status drifting away from "pregnant" (e.g. another workflow).
    await db.update(goatsTable).set({ lactationStatus: "milking" }).where(eq(goatsTable.id, doe.id));

    // Saving "confirmed-pregnant" again should NOT re-fire the transition, because the
    // breeding is already in that status.
    const res = await request(app)
      .put(`/api/breedings/${breeding.id}`)
      .send({ status: "confirmed-pregnant", notes: "second save" });

    expect(res.status).toBe(200);
    const doeAfter = await getDoe(doe.id);
    expect(doeAfter.lactationStatus).toBe("milking");
  });

  it("reopening a breeding reverts a pregnant doe back to 'dry'", async () => {
    const doe = await createDoe("pregnant");
    const breeding = await createBreeding(doe.id, "confirmed-pregnant");

    const res = await request(app)
      .put(`/api/breedings/${breeding.id}`)
      .send({ status: "open" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("open");

    const updatedDoe = await getDoe(doe.id);
    expect(updatedDoe.lactationStatus).toBe("dry");
  });

  it("reopening a breeding does not change a doe that is not pregnant", async () => {
    const doe = await createDoe("milking");
    const breeding = await createBreeding(doe.id, "bred");

    await request(app).put(`/api/breedings/${breeding.id}`).send({ status: "open" });

    const updatedDoe = await getDoe(doe.id);
    expect(updatedDoe.lactationStatus).toBe("milking");
  });
});

describe("POST /api/breedings/:id/kids doe status transition", () => {
  it("recording kids sets the doe to 'milking'", async () => {
    const doe = await createDoe("pregnant");
    const breeding = await createBreeding(doe.id, "confirmed-pregnant");

    const res = await request(app)
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

    const [updatedBreeding] = await db
      .select()
      .from(breedingsTable)
      .where(eq(breedingsTable.id, breeding.id));
    expect(updatedBreeding.status).toBe("kidded");
  });
});
