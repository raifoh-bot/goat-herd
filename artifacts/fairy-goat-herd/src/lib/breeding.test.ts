import { describe, it, expect } from "vitest";
import { parseDueDate, getEffectiveDueDate, doeLeftHerd } from "@/lib/breeding";

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
