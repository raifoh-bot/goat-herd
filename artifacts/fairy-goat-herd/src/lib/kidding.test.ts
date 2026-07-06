import { describe, it, expect } from "vitest";
import { deriveKiddingRecord, deriveKiddingHistory, summarizeKids } from "./kidding";
import type { BreedingWithDoe } from "@workspace/api-client-react/src/generated/api.schemas";

function breeding(overrides: Partial<BreedingWithDoe>): BreedingWithDoe {
  return {
    id: 1,
    doeId: 10,
    sireName: "Buck",
    breedingDate: "2025-01-01",
    expectedKiddingDate: "2025-05-31",
    status: "kidded",
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
    ...overrides,
  } as BreedingWithDoe;
}

function kid(
  birthDate?: string,
  extra?: Partial<NonNullable<BreedingWithDoe["kids"]>[number]>,
) {
  return {
    id: 1,
    breedingId: 1,
    sex: "doe",
    birthDate,
    createdAt: "2025-06-01T00:00:00Z",
    updatedAt: "2025-06-01T00:00:00Z",
    ...extra,
  } as NonNullable<BreedingWithDoe["kids"]>[number];
}

describe("deriveKiddingRecord", () => {
  it("counts only kidded breedings for the given doe", () => {
    const breedings = [
      breeding({ id: 1, doeId: 10, status: "kidded", kids: [kid("2025-06-01")] }),
      breeding({ id: 2, doeId: 10, status: "bred" }),
      breeding({ id: 3, doeId: 99, status: "kidded", kids: [kid("2025-07-01")] }),
    ];
    const record = deriveKiddingRecord(10, breedings);
    expect(record.timesKidded).toBe(1);
    expect(record.lastKiddingDate).toBe("2025-06-01");
  });

  it("uses the latest kid birth date across multiple kiddings", () => {
    const breedings = [
      breeding({ id: 1, kids: [kid("2024-03-15"), kid("2024-03-16")] }),
      breeding({ id: 2, kids: [kid("2026-02-20")] }),
    ];
    const record = deriveKiddingRecord(10, breedings);
    expect(record.timesKidded).toBe(2);
    expect(record.lastKiddingDate).toBe("2026-02-20");
  });

  it("falls back to expected kidding date, then breeding date, when kids have no birth date", () => {
    const noBirthDates = deriveKiddingRecord(10, [
      breeding({ id: 1, kids: [kid(undefined)], expectedKiddingDate: "2025-05-31" }),
    ]);
    expect(noBirthDates.timesKidded).toBe(1);
    expect(noBirthDates.lastKiddingDate).toBe("2025-05-31");

    const noExpected = deriveKiddingRecord(10, [
      breeding({ id: 1, kids: [], expectedKiddingDate: undefined, breedingDate: "2025-01-01" }),
    ]);
    expect(noExpected.lastKiddingDate).toBe("2025-01-01");
  });

  it("returns zero and no date for a doe with no kiddings", () => {
    const record = deriveKiddingRecord(10, [breeding({ id: 1, status: "bred" })]);
    expect(record.timesKidded).toBe(0);
    expect(record.lastKiddingDate).toBeNull();
  });
});

describe("summarizeKids", () => {
  it("summarizes does and bucks with pluralization", () => {
    expect(
      summarizeKids([
        kid("2025-06-01", { id: 1, sex: "doe" }),
        kid("2025-06-01", { id: 2, sex: "doe" }),
        kid("2025-06-01", { id: 3, sex: "buck" }),
      ]),
    ).toBe("2 does, 1 buck");
  });

  it("appends a DOA count when present", () => {
    expect(
      summarizeKids([
        kid("2025-06-01", { id: 1, sex: "doe" }),
        kid("2025-06-01", { id: 2, sex: "buck", kidStatus: "doa" }),
      ]),
    ).toBe("1 doe, 1 buck (1 DOA)");
  });

  it("returns 'Not recorded' when there are no kids", () => {
    expect(summarizeKids([])).toBe("Not recorded");
    expect(summarizeKids(undefined)).toBe("Not recorded");
  });
});

describe("deriveKiddingHistory", () => {
  it("returns one row per kidded breeding for the doe, newest first", () => {
    const rows = deriveKiddingHistory(10, [
      breeding({ id: 1, kids: [kid("2024-03-15", { id: 1 })], sireName: "Old Buck" }),
      breeding({ id: 2, kids: [kid("2026-02-20", { id: 2, sex: "buck" })], sireName: "New Buck" }),
      breeding({ id: 3, doeId: 99, kids: [kid("2025-07-01", { id: 3 })] }),
      breeding({ id: 4, status: "bred" }),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      breedingId: 2,
      date: "2026-02-20",
      sireName: "New Buck",
      kidsSummary: "1 buck",
    });
    expect(rows[1]).toEqual({
      breedingId: 1,
      date: "2024-03-15",
      sireName: "Old Buck",
      kidsSummary: "1 doe",
    });
  });

  it("falls back to expected kidding date, then breeding date", () => {
    const rows = deriveKiddingHistory(10, [
      breeding({ id: 1, kids: [], expectedKiddingDate: "2025-05-31" }),
      breeding({
        id: 2,
        kids: [],
        expectedKiddingDate: undefined,
        breedingDate: "2025-01-01",
      }),
    ]);
    expect(rows.map((r) => r.date)).toEqual(["2025-05-31", "2025-01-01"]);
    expect(rows.every((r) => r.kidsSummary === "Not recorded")).toBe(true);
  });

  it("reports missing sire names as null", () => {
    const rows = deriveKiddingHistory(10, [
      breeding({ id: 1, sireName: "", kids: [kid("2025-06-01")] }),
    ]);
    expect(rows[0]?.sireName).toBeNull();
  });
});
