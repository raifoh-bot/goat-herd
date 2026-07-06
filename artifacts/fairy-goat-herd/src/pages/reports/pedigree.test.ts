import { describe, it, expect } from "vitest";
import { deriveKiddingRecord } from "./pedigree";
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

function kid(birthDate?: string) {
  return {
    id: 1,
    breedingId: 1,
    sex: "doe",
    birthDate,
    createdAt: "2025-06-01T00:00:00Z",
    updatedAt: "2025-06-01T00:00:00Z",
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
