import { describe, it, expect } from "vitest";
import { parseDueDate, getEffectiveDueDate } from "@/lib/breeding";

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
