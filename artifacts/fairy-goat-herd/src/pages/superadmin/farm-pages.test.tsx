import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactNode } from "react";
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { SuperadminFarm } from "@workspace/api-client-react";

// ---------------------------------------------------------------------------
// Mocks. We keep the real wouter router (so App's route matching and guards
// run for real against window.location) but stub <Redirect> with a marker so
// guard redirects can be asserted without real navigation side effects.
// ---------------------------------------------------------------------------

let farmsData: SuperadminFarm[] | undefined;
let currentUser: unknown = undefined;

vi.mock("wouter", async (importOriginal) => {
  const actual = await importOriginal<typeof import("wouter")>();
  return {
    ...actual,
    Redirect: ({ to }: { to: string }) => (
      <div data-testid="redirect-marker" data-to={to} />
    ),
  };
});

vi.mock("@workspace/api-client-react", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@workspace/api-client-react")>();
  return {
    ...actual,
    useListFarms: () => ({
      data: farmsData,
      isLoading: false,
      error: null,
    }),
    useGetPlatformSettings: () => ({ data: undefined }),
    useGetPlatformSummary: () => ({ data: undefined }),
    useGetCurrentUser: () => ({
      data: currentUser,
      isLoading: false,
      error: currentUser ? undefined : { status: 401 },
    }),
    useLogout: () => ({ mutate: vi.fn(), isPending: false }),
    setAuthTokenGetter: vi.fn(),
  };
});

import SuperadminFarms from "@/pages/superadmin/farms";
import SuperadminSuspendedFarms from "@/pages/superadmin/suspended-farms";
import SuperadminDeletedFarms from "@/pages/superadmin/deleted-farms";
import App from "@/App";

// ---------------------------------------------------------------------------
// Fixtures: one farm in every lifecycle state, including the tricky overlap
// (a farm that was suspended and then deleted must appear ONLY on Deleted).
// ---------------------------------------------------------------------------

function makeFarm(overrides: Partial<SuperadminFarm> & { id: number; name: string; slug: string }): SuperadminFarm {
  return {
    status: "active",
    userCount: 1,
    goatCount: 0,
    breedingCount: 0,
    lastActiveAt: null,
    deletedAt: null,
    deletedReason: null,
    deletedByUsername: null,
    ...overrides,
  };
}

const activeFarm = makeFarm({ id: 1, name: "Active Acres", slug: "active-acres" });
const pendingFarm = makeFarm({ id: 2, name: "Pending Pastures", slug: "pending-pastures", status: "pending" });
const rejectedFarm = makeFarm({ id: 3, name: "Rejected Ranch", slug: "rejected-ranch", status: "rejected" });
const suspendedFarm = makeFarm({ id: 4, name: "Suspended Springs", slug: "suspended-springs", status: "suspended" });
const deletedFarm = makeFarm({
  id: 5,
  name: "Deleted Dale",
  slug: "deleted-dale",
  deletedAt: "2026-07-01T00:00:00.000Z",
  deletedReason: "Duplicate",
  deletedByUsername: "root",
});
// Overlap case: suspended AND deleted — must count as deleted only.
const suspendedThenDeletedFarm = makeFarm({
  id: 6,
  name: "Gone Gulch",
  slug: "gone-gulch",
  status: "suspended",
  deletedAt: "2026-07-15T00:00:00.000Z",
  deletedReason: "Closed down",
  deletedByUsername: "root",
});

const ALL_FARMS = [
  activeFarm,
  pendingFarm,
  rejectedFarm,
  suspendedFarm,
  deletedFarm,
  suspendedThenDeletedFarm,
];

function renderWithClient(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{node}</QueryClientProvider>,
  );
}

/** Which of the fixture farm names are visible in the given container. */
function visibleFarmNames(container: HTMLElement): string[] {
  return ALL_FARMS.map((f) => f.name).filter(
    (name) => within(container).queryAllByText(name).length > 0,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  farmsData = ALL_FARMS;
  currentUser = { id: 1, username: "root", role: "superadmin", farmSlug: null };
  window.history.replaceState(null, "", "/");
});

// ---------------------------------------------------------------------------
// Partition: every farm appears on exactly one of the three pages.
// ---------------------------------------------------------------------------

describe("Super-admin farm pages — partition of the farm list", () => {
  it("Farms shows only non-deleted, non-suspended farms (incl. pending/rejected)", () => {
    const { container } = renderWithClient(<SuperadminFarms />);
    expect(visibleFarmNames(container).sort()).toEqual(
      [activeFarm.name, pendingFarm.name, rejectedFarm.name].sort(),
    );
  });

  it("Suspended shows only suspended, non-deleted farms", () => {
    const { container } = renderWithClient(<SuperadminSuspendedFarms />);
    expect(visibleFarmNames(container)).toEqual([suspendedFarm.name]);
  });

  it("Deleted shows only deleted farms, including a suspended-then-deleted one", () => {
    const { container } = renderWithClient(<SuperadminDeletedFarms />);
    expect(visibleFarmNames(container).sort()).toEqual(
      [deletedFarm.name, suspendedThenDeletedFarm.name].sort(),
    );
  });

  it("no farm is lost or duplicated across the three pages", () => {
    const farmsPage = renderWithClient(<SuperadminFarms />);
    const onFarms = visibleFarmNames(farmsPage.container);
    farmsPage.unmount();

    const suspendedPage = renderWithClient(<SuperadminSuspendedFarms />);
    const onSuspended = visibleFarmNames(suspendedPage.container);
    suspendedPage.unmount();

    const deletedPage = renderWithClient(<SuperadminDeletedFarms />);
    const onDeleted = visibleFarmNames(deletedPage.container);
    deletedPage.unmount();

    const all = [...onFarms, ...onSuspended, ...onDeleted];
    // Every farm appears somewhere…
    expect(all.sort()).toEqual(ALL_FARMS.map((f) => f.name).sort());
    // …and nowhere twice.
    expect(new Set(all).size).toBe(all.length);
  });

  it("shows empty states instead of other pages' farms when a bucket is empty", () => {
    farmsData = [activeFarm];
    const suspended = renderWithClient(<SuperadminSuspendedFarms />);
    expect(screen.getByText("No suspended farms.")).toBeInTheDocument();
    suspended.unmount();

    renderWithClient(<SuperadminDeletedFarms />);
    expect(screen.getByText("No deleted farms.")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Route guards: the two new routes are superadmin-only. We render the real
// App (real wouter routing against window.location) with a mocked session.
// ---------------------------------------------------------------------------

describe("Super-admin route guards", () => {
  function renderAppAt(path: string) {
    window.history.replaceState(null, "", path);
    return render(<App />);
  }

  it("redirects a non-superadmin away from /superadmin/suspended-farms", () => {
    currentUser = { id: 2, username: "owner", role: "owner", farmSlug: "smith" };
    renderAppAt("/superadmin/suspended-farms");

    const marker = screen.getByTestId("redirect-marker");
    expect(marker).toHaveAttribute("data-to", "/");
    expect(screen.queryByText("Suspended farms")).toBeNull();
  });

  it("redirects a non-superadmin away from /superadmin/deleted-farms", () => {
    currentUser = { id: 3, username: "admin", role: "admin", farmSlug: "smith" };
    renderAppAt("/superadmin/deleted-farms");

    const marker = screen.getByTestId("redirect-marker");
    expect(marker).toHaveAttribute("data-to", "/");
    expect(screen.queryByText("Deleted farms")).toBeNull();
  });

  it("does not render the suspended-farms page for an unauthenticated visitor", () => {
    currentUser = undefined;
    renderAppAt("/superadmin/suspended-farms");
    expect(screen.queryByText("Suspended farms")).toBeNull();
  });

  it("lets a superadmin see the suspended and deleted farms pages", () => {
    const suspended = renderAppAt("/superadmin/suspended-farms");
    expect(screen.getByText("Suspended farms")).toBeInTheDocument();
    expect(screen.getByText(suspendedFarm.name)).toBeInTheDocument();
    suspended.unmount();

    renderAppAt("/superadmin/deleted-farms");
    expect(screen.getByText("Deleted farms")).toBeInTheDocument();
    expect(screen.getByText(deletedFarm.name)).toBeInTheDocument();
  });
});
