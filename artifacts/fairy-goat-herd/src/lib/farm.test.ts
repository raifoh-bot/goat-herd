import { describe, it, expect } from "vitest";
import { deriveFarmSlug } from "@/lib/farm";

describe("deriveFarmSlug", () => {
  it("reads the first path segment as the farm slug", () => {
    expect(deriveFarmSlug("/smithfarm", "")).toBe("smithfarm");
    expect(deriveFarmSlug("/smithfarm/goats", "")).toBe("smithfarm");
    expect(deriveFarmSlug("/smithfarm/breedings/42", "")).toBe("smithfarm");
  });

  it("lowercases the slug", () => {
    expect(deriveFarmSlug("/SmithFarm/goats", "")).toBe("smithfarm");
  });

  it("returns null at the root (no farm context)", () => {
    expect(deriveFarmSlug("/", "")).toBeNull();
    expect(deriveFarmSlug("", "")).toBeNull();
  });

  it("returns null for reserved words so they route as global pages", () => {
    expect(deriveFarmSlug("/login", "")).toBeNull();
    expect(deriveFarmSlug("/register", "")).toBeNull();
    expect(deriveFarmSlug("/superadmin/farms", "")).toBeNull();
    expect(deriveFarmSlug("/goats", "")).toBeNull();
    expect(deriveFarmSlug("/admin/settings", "")).toBeNull();
    expect(deriveFarmSlug("/api/goats", "")).toBeNull();
  });

  it("strips the artifact base path before reading the slug", () => {
    expect(deriveFarmSlug("/app/smithfarm/goats", "/app")).toBe("smithfarm");
    expect(deriveFarmSlug("/app/login", "/app")).toBeNull();
    expect(deriveFarmSlug("/app/", "/app")).toBeNull();
  });
});
