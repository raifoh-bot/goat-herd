import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AuthUser } from "@workspace/api-client-react";
import { DEFAULT_FARM_NAME, type FarmSettingsValues } from "@/lib/settings";

const useAuthMock = vi.fn();
const useFarmSettingsMock = vi.fn();

vi.mock("@/lib/auth", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/lib/settings", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/settings")>();
  return {
    ...actual,
    useFarmSettings: () => useFarmSettingsMock(),
  };
});

import { OnboardingBanner } from "./onboarding-banner";

const BANNER_HEADING = "Welcome to MyGoatHerd!";

function makeUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return { id: 1, username: "owner", role: "owner", ...overrides };
}

function makeSettings(
  overrides: Partial<FarmSettingsValues> = {},
): FarmSettingsValues {
  return {
    usesAi: true,
    farmName: DEFAULT_FARM_NAME,
    adgaNumber: null,
    logoUrl: null,
    weightUnit: "lb",
    gestationDays: 150,
    enabledBreeds: [],
    famachaThreshold: 3,
    isLoading: false,
    ...overrides,
  };
}

function setup(opts: {
  user?: Partial<AuthUser>;
  settings?: Partial<FarmSettingsValues>;
} = {}) {
  useAuthMock.mockReturnValue({ user: makeUser(opts.user) });
  useFarmSettingsMock.mockReturnValue(makeSettings(opts.settings));
  return render(<OnboardingBanner />);
}

function queryBanner() {
  return screen.queryByRole("heading", { name: BANNER_HEADING });
}

describe("OnboardingBanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe("visibility for an Owner with an unconfigured farm", () => {
    it("shows the banner when the farm name is still the default", () => {
      setup({ settings: { farmName: DEFAULT_FARM_NAME } });
      expect(queryBanner()).toBeInTheDocument();
    });

    it("shows the banner when the farm name is empty", () => {
      setup({ settings: { farmName: "" } });
      expect(queryBanner()).toBeInTheDocument();
    });

    it("shows the banner when the farm name is only whitespace", () => {
      setup({ settings: { farmName: "   " } });
      expect(queryBanner()).toBeInTheDocument();
    });
  });

  describe("visibility once the farm is configured", () => {
    it("hides the banner when the farm name is a custom value", () => {
      setup({ settings: { farmName: "Sunny Acres Dairy" } });
      expect(queryBanner()).not.toBeInTheDocument();
    });

    it("stays hidden while settings are still loading", () => {
      setup({ settings: { farmName: DEFAULT_FARM_NAME, isLoading: true } });
      expect(queryBanner()).not.toBeInTheDocument();
    });
  });

  describe("role gating", () => {
    it("never shows the banner to an Admin", () => {
      setup({
        user: { role: "admin" },
        settings: { farmName: DEFAULT_FARM_NAME },
      });
      expect(queryBanner()).not.toBeInTheDocument();
    });

    it("never shows the banner to a Farm Hand", () => {
      setup({
        user: { role: "farmhand" },
        settings: { farmName: DEFAULT_FARM_NAME },
      });
      expect(queryBanner()).not.toBeInTheDocument();
    });
  });

  describe("dismissal", () => {
    it("hides the banner and persists the dismissal when 'Skip for now' is clicked", async () => {
      const user = userEvent.setup();
      setup({ user: { id: 7 }, settings: { farmName: DEFAULT_FARM_NAME } });

      expect(queryBanner()).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Skip for now" }));

      expect(queryBanner()).not.toBeInTheDocument();
      expect(localStorage.getItem("onboarding_dismissed_7")).toBe("1");
    });

    it("hides the banner and persists the dismissal when the close button is clicked", async () => {
      const user = userEvent.setup();
      setup({ user: { id: 9 }, settings: { farmName: DEFAULT_FARM_NAME } });

      expect(queryBanner()).toBeInTheDocument();
      await user.click(
        screen.getByRole("button", { name: "Dismiss setup guide" }),
      );

      expect(queryBanner()).not.toBeInTheDocument();
      expect(localStorage.getItem("onboarding_dismissed_9")).toBe("1");
    });

    it("stays hidden on re-mount when the dismissal key is already present", () => {
      localStorage.setItem("onboarding_dismissed_3", "1");
      setup({ user: { id: 3 }, settings: { farmName: DEFAULT_FARM_NAME } });
      expect(queryBanner()).not.toBeInTheDocument();
    });

    it("is scoped per user — another user's dismissal does not hide it", () => {
      localStorage.setItem("onboarding_dismissed_99", "1");
      setup({ user: { id: 3 }, settings: { farmName: DEFAULT_FARM_NAME } });
      expect(queryBanner()).toBeInTheDocument();
    });
  });
});
