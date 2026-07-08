import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";

/**
 * These tests render the real <App /> with the real wouter router driven by
 * the browser (jsdom) history, so the `/lineage` → `/reports/lineage`
 * redirect in App.tsx is exercised exactly as a bookmarked URL would hit it.
 */

let currentUser: unknown = undefined;

const GOATS = [
  {
    id: 1,
    name: "Clover",
    damName: "Daisy",
    sireName: "Buckley",
    dateOfBirth: "2023-03-01",
  },
  {
    id: 2,
    name: "Hazel",
    damName: "Willow",
    sireName: "Bruno",
    dateOfBirth: "2022-05-10",
  },
];

vi.mock("@workspace/api-client-react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/api-client-react")>();
  return {
    ...actual,
    useGetCurrentUser: () => ({
      data: currentUser,
      isLoading: false,
      error: undefined,
    }),
    getGetCurrentUserQueryKey: () => ["/api/auth/me"],
    useListGoats: () => ({ data: GOATS, isLoading: false }),
    useGetSettings: () => ({ data: undefined, isLoading: false }),
    getGetSettingsQueryKey: () => ["/api/settings"],
    useLogout: () => ({ mutate: vi.fn(), isPending: false }),
    setFarmSlug: vi.fn(),
    setAuthTokenGetter: vi.fn(),
  };
});

// The quick-photo shortcut in the sidebar pulls in upload machinery that is
// irrelevant to routing; stub it out so Layout renders cheaply.
vi.mock("@/components/quick-photo-capture", () => ({
  QuickPhotoCapture: () => null,
}));

import App from "@/App";

/** Point the browser at a URL, as if the user opened a bookmark. */
function openBookmark(pathname: string) {
  window.history.replaceState({}, "", pathname);
}

/** The "Reports" item in the sidebar nav. */
function reportsNavLink() {
  const nav = screen.getByRole("navigation", { name: "Main" });
  return within(nav).getByRole("link", { name: "Reports" });
}

function dashboardNavLink() {
  const nav = screen.getByRole("navigation", { name: "Main" });
  return within(nav).getByRole("link", { name: "Dashboard" });
}

const ACTIVE_CLASS = "bg-sidebar-primary";

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  currentUser = {
    id: 1,
    username: "owner",
    role: "owner",
    farmSlug: "smithfarm",
  };
});

describe("legacy /lineage bookmark", () => {
  it("redirects /<slug>/lineage to /<slug>/reports/lineage and renders the lineage table", async () => {
    openBookmark("/smithfarm/lineage");

    render(<App />);

    // The old bookmark must land on the new report URL...
    await waitFor(() =>
      expect(window.location.pathname).toBe("/smithfarm/reports/lineage"),
    );

    // ...and actually render the lineage report, not a 404.
    expect(
      screen.getByRole("heading", { name: "Lineage Reports" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/did you forget to add the page/i)).toBeNull();

    // The pedigree table shows the herd.
    expect(screen.getByRole("link", { name: "Clover" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Hazel" })).toBeInTheDocument();
    expect(screen.getByText("Daisy")).toBeInTheDocument();
    expect(screen.getByText("Buckley")).toBeInTheDocument();
  });

  it("keeps the Reports nav item highlighted after the redirect (/reports/lineage)", async () => {
    openBookmark("/smithfarm/lineage");

    render(<App />);

    await waitFor(() =>
      expect(window.location.pathname).toBe("/smithfarm/reports/lineage"),
    );

    expect(reportsNavLink().className).toContain(ACTIVE_CLASS);
    expect(dashboardNavLink().className).not.toContain(ACTIVE_CLASS);
  });
});

describe("Reports nav highlighting", () => {
  it("highlights the Reports nav item on the reports hub (/reports)", async () => {
    openBookmark("/smithfarm/reports");

    render(<App />);

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Reports" }),
      ).toBeInTheDocument(),
    );

    expect(reportsNavLink().className).toContain(ACTIVE_CLASS);
    expect(dashboardNavLink().className).not.toContain(ACTIVE_CLASS);
  });
});
