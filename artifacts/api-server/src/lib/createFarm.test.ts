import { describe, it, expect } from "vitest";
import { normalizeSlug } from "./createFarm";

describe("normalizeSlug", () => {
  it("accepts and lowercases a valid slug", () => {
    expect(normalizeSlug("SmithFarm")).toEqual({ ok: true, slug: "smithfarm" });
    expect(normalizeSlug("  smith-dairy  ")).toEqual({ ok: true, slug: "smith-dairy" });
  });

  it("rejects reserved app/platform words so slugs can't shadow routes", () => {
    for (const reserved of ["login", "register", "admin", "superadmin", "api", "default"]) {
      expect(normalizeSlug(reserved).ok).toBe(false);
    }
  });

  it("rejects top-level route words (goats/breedings/inventory/lineage)", () => {
    for (const reserved of ["goats", "breedings", "inventory", "lineage"]) {
      expect(normalizeSlug(reserved).ok).toBe(false);
    }
  });

  it("rejects malformed slugs", () => {
    expect(normalizeSlug("ab").ok).toBe(false); // too short
    expect(normalizeSlug("-lead").ok).toBe(false); // leading hyphen
    expect(normalizeSlug("has space").ok).toBe(false); // invalid char
  });
});
