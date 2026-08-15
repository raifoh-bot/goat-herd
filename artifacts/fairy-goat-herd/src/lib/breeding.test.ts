import { describe, it, expect } from "vitest";
import { parseDueDate, getEffectiveDueDate, doeLeftHerd } from "@/lib/breeding";
import type { BreedingWithDoe } from "@workspace/api-client-react";

// ---------------------------------------------------------------------------
// Minimal factory helpers
// ---------------------------------------------------------------------------

/** Build a BreedingWithDoe fixture. Only the fields used by the widget
 *  filter logic are required; everything else is given a safe default. */
function makeBreeding(
  overrides: Partial<BreedingWithDoe> & { doe?: Partial<BreedingWithDoe["doe"]> },
): BreedingWithDoe {
  return {
    id: 1,
    farmId: "test-farm",
    doeId: 1,
    sireName: "Buck",
    breedingMethod: "natural",
    semenSource: null,
    semenStrawId: null,
    breedingDate: "2026-04-01",
    expectedKiddingDate: "2026-08-29",
    status: "bred",
    notes: null,
    createdAt: "2026-04-01T00:00:00Z",
    updatedAt: "2026-04-01T00:00:00Z",
    kids: [],
    hasActiveExposure: false,
    exposedDays: null,
    coverCount: 0,
    hasExposureEvents: false,
    firstExposedDate: null,
    lastRemovedDate: null,
    ...overrides,
    doe: {
      id: 1,
      farmId: "test-farm",
      name: "Dot",
      tagId: null,
      sex: "doe",
      dateOfBirth: null,
      breed: null,
      color: null,
      herdStatus: "on-farm",
      breedingStatus: null,
      lactationStatus: null,
      healthStatus: null,
      notes: null,
      sireId: null,
      damId: null,
      registrationNumber: null,
      registrationBody: null,
      imageUrl: null,
      imageAlt: null,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      ...overrides.doe,
    },
  } as BreedingWithDoe;
}

/**
 * Mirrors the widget filter applied in dashboard.tsx and BreedingCalendarWidget:
 *   1. Only active breedings (bred / confirmed-pregnant)
 *   2. Doe has not left the herd
 *   3. A computable due date exists
 */
function applyWidgetFilter(
  breedings: BreedingWithDoe[],
  gestationDays = 150,
): Array<BreedingWithDoe & { due: Date }> {
  return breedings
    .filter((b) => b.status === "bred" || b.status === "confirmed-pregnant")
    .filter((b) => !doeLeftHerd(b))
    .map((b) => ({ ...b, due: getEffectiveDueDate(b, gestationDays) }))
    .filter((b): b is BreedingWithDoe & { due: Date } => b.due !== null);
}

const key = (d: Date | null) =>
  d
    ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate(),
      ).padStart(2, "0")}`
    : null;

describe("parseDueDate", () => {
  it("anchors a date-only string to the local calendar day", () => {
    expect(key(parseDueDate("2026-07-27"))).toBe("2026-07-27");
  });

  it("normalizes a full timestamp to its local calendar day", () => {
    expect(key(parseDueDate("2026-07-27T13:45:00"))).toBe("2026-07-27");
  });

  it("returns null for missing or invalid values", () => {
    expect(parseDueDate(null)).toBeNull();
    expect(parseDueDate(undefined)).toBeNull();
    expect(parseDueDate("")).toBeNull();
    expect(parseDueDate("not-a-date")).toBeNull();
  });
});

describe("getEffectiveDueDate", () => {
  it("uses the recorded expected kidding date when present", () => {
    const due = getEffectiveDueDate(
      { expectedKiddingDate: "2026-08-01", breedingDate: "2026-03-01" },
      150,
    );
    expect(key(due)).toBe("2026-08-01");
  });

  it("falls back to breeding date + gestation days when none recorded", () => {
    // 2026-02-28 + 150 days = 2026-07-28
    const due = getEffectiveDueDate(
      { expectedKiddingDate: null, breedingDate: "2026-02-28" },
      150,
    );
    expect(key(due)).toBe("2026-07-28");
  });

  it("computes the same day from a date-only string and a full timestamp", () => {
    const a = getEffectiveDueDate(
      { expectedKiddingDate: null, breedingDate: "2026-02-28" },
      150,
    );
    const b = getEffectiveDueDate(
      { expectedKiddingDate: null, breedingDate: "2026-02-28T08:30:00" },
      150,
    );
    expect(key(a)).toBe(key(b));
  });

  it("returns null when both dates are unusable", () => {
    expect(
      getEffectiveDueDate({ expectedKiddingDate: null, breedingDate: "" }, 150),
    ).toBeNull();
  });
});

describe("doeLeftHerd", () => {
  it("returns true for sold-registered does", () => {
    expect(doeLeftHerd({ doe: { id: 1, name: "Dot", herdStatus: "sold-registered" } })).toBe(true);
  });

  it("returns true for sold-not-registered does", () => {
    expect(doeLeftHerd({ doe: { id: 2, name: "Pip", herdStatus: "sold-not-registered" } })).toBe(true);
  });

  it("returns true for dead does", () => {
    expect(doeLeftHerd({ doe: { id: 3, name: "Mae", herdStatus: "dead" } })).toBe(true);
  });

  it("returns false for on-farm does", () => {
    expect(doeLeftHerd({ doe: { id: 4, name: "Bea", herdStatus: "on-farm" } })).toBe(false);
  });

  it("returns false for does on boarding", () => {
    expect(doeLeftHerd({ doe: { id: 5, name: "Flo", herdStatus: "on-farm-boarding" } })).toBe(false);
  });

  it("returns false when herd status is null (treats missing status as on-farm)", () => {
    expect(doeLeftHerd({ doe: { id: 6, name: "Joy", herdStatus: null } })).toBe(false);
  });

  it("returns false when herd status is undefined (no status set)", () => {
    expect(doeLeftHerd({ doe: { id: 7, name: "Eve" } })).toBe(false);
  });

  it("returns false when doe is undefined (breeding has no doe linked)", () => {
    expect(doeLeftHerd({ doe: undefined })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Widget filter round-trip: sale deleted → doe returns to herd
// ---------------------------------------------------------------------------

describe("kidding widget filter — sale-deleted round-trip", () => {
  it("hides a sold doe's active breeding from the upcoming-kiddings widget", () => {
    const breeding = makeBreeding({ doe: { herdStatus: "sold-registered" } });
    const visible = applyWidgetFilter([breeding]);
    expect(visible).toHaveLength(0);
  });

  it("hides a sold-not-registered doe from the widget", () => {
    const breeding = makeBreeding({ doe: { herdStatus: "sold-not-registered" } });
    expect(applyWidgetFilter([breeding])).toHaveLength(0);
  });

  it("hides a dead doe from the widget", () => {
    const breeding = makeBreeding({ doe: { herdStatus: "dead" } });
    expect(applyWidgetFilter([breeding])).toHaveLength(0);
  });

  it("shows the breeding again once the doe's status is reverted to on-farm", () => {
    // Step 1: doe is sold — she should be absent.
    const soldBreeding = makeBreeding({ doe: { herdStatus: "sold-registered" } });
    expect(applyWidgetFilter([soldBreeding])).toHaveLength(0);

    // Step 2: sale deleted — status reverts to on-farm.
    const returnedBreeding = makeBreeding({ doe: { herdStatus: "on-farm" } });
    const visible = applyWidgetFilter([returnedBreeding]);
    expect(visible).toHaveLength(1);
    expect(visible[0].due).toBeInstanceOf(Date);
  });

  it("shows the breeding again when status reverts to on-farm-boarding", () => {
    const soldBreeding = makeBreeding({ doe: { herdStatus: "sold-not-registered" } });
    expect(applyWidgetFilter([soldBreeding])).toHaveLength(0);

    const returnedBreeding = makeBreeding({ doe: { herdStatus: "on-farm-boarding" } });
    expect(applyWidgetFilter([returnedBreeding])).toHaveLength(1);
  });

  it("preserves the expected kidding date when the doe returns", () => {
    const breeding = makeBreeding({
      expectedKiddingDate: "2026-09-15",
      doe: { herdStatus: "on-farm" },
    });
    const [result] = applyWidgetFilter([breeding]);
    expect(result).toBeDefined();
    const key = `${result.due.getFullYear()}-${String(result.due.getMonth() + 1).padStart(2, "0")}-${String(result.due.getDate()).padStart(2, "0")}`;
    expect(key).toBe("2026-09-15");
  });

  it("falls back to breeding date + gestation when expectedKiddingDate is absent, after return", () => {
    // 2026-04-01 + 150 days = 2026-08-29
    const breeding = makeBreeding({
      expectedKiddingDate: null,
      breedingDate: "2026-04-01",
      doe: { herdStatus: "on-farm" },
    });
    const [result] = applyWidgetFilter([breeding], 150);
    const key = `${result.due.getFullYear()}-${String(result.due.getMonth() + 1).padStart(2, "0")}-${String(result.due.getDate()).padStart(2, "0")}`;
    expect(key).toBe("2026-08-29");
  });

  it("keeps a kidded breeding hidden (status filter) regardless of herd status", () => {
    const breeding = makeBreeding({ status: "kidded", doe: { herdStatus: "on-farm" } });
    expect(applyWidgetFilter([breeding])).toHaveLength(0);
  });

  it("shows confirmed-pregnant doe after returning from sold status", () => {
    const soldBreeding = makeBreeding({
      status: "confirmed-pregnant",
      doe: { herdStatus: "sold-registered" },
    });
    expect(applyWidgetFilter([soldBreeding])).toHaveLength(0);

    const returnedBreeding = makeBreeding({
      status: "confirmed-pregnant",
      doe: { herdStatus: "on-farm" },
    });
    expect(applyWidgetFilter([returnedBreeding])).toHaveLength(1);
  });

  it("handles multiple does where one is sold and one is on-farm", () => {
    const soldDoe = makeBreeding({ id: 1, doeId: 1, doe: { id: 1, name: "Dot", herdStatus: "sold-registered" } });
    const onFarmDoe = makeBreeding({ id: 2, doeId: 2, doe: { id: 2, name: "Bea", herdStatus: "on-farm" } });
    const visible = applyWidgetFilter([soldDoe, onFarmDoe]);
    expect(visible).toHaveLength(1);
    expect(visible[0].doe?.name).toBe("Bea");
  });

  it("shows all does after all sale records are deleted (all revert to on-farm)", () => {
    const breedings = [
      makeBreeding({ id: 1, doeId: 1, doe: { id: 1, name: "Dot", herdStatus: "on-farm" } }),
      makeBreeding({ id: 2, doeId: 2, doe: { id: 2, name: "Bea", herdStatus: "on-farm" } }),
      makeBreeding({ id: 3, doeId: 3, doe: { id: 3, name: "Mae", herdStatus: "on-farm" } }),
    ];
    expect(applyWidgetFilter(breedings)).toHaveLength(3);
  });
});
