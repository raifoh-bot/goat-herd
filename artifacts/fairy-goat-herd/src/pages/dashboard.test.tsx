import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactNode } from "react";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AuthUser, DashboardWidget } from "@workspace/api-client-react";
import { DASHBOARD_WIDGETS } from "@/lib/dashboard-widgets";

/**
 * Captured props from the most recent render of the (mocked) grid. This lets a
 * test inspect the derived layout, read the drag/resize lock flags, and fire
 * `onDragStop`/`onResizeStop` with a synthetic layout to simulate a move — all
 * without a real DOM drag, which jsdom can't do.
 */
interface GridProps {
  layouts: { lg: GridItem[]; xs: GridItem[] };
  isDraggable: boolean;
  isResizable: boolean;
  onDragStop: (layout: GridItem[]) => void;
  onResizeStop: (layout: GridItem[]) => void;
  children: ReactNode;
}
interface GridItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

let gridProps: GridProps | null = null;

vi.mock("react-grid-layout", () => {
  const Responsive = (props: GridProps) => {
    gridProps = props;
    return <div data-testid="grid-layout">{props.children}</div>;
  };
  return {
    __esModule: true,
    Responsive,
    WidthProvider: (Comp: unknown) => Comp,
    default: Responsive,
  };
});

vi.mock("wouter", () => ({
  useLocation: () => ["/", vi.fn()] as const,
  Link: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/components/layout", () => ({
  Layout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/onboarding-banner", () => ({
  OnboardingBanner: () => null,
}));

let authUser: AuthUser = { id: 1, username: "u", role: "owner" };
let isManagerValue = true;

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: authUser }),
  useIsManager: () => isManagerValue,
}));

const updatePersonalMock = vi.fn();
const updateFarmMock = vi.fn();
let farmLayout: DashboardWidget[] | null = null;

vi.mock("@workspace/api-client-react", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@workspace/api-client-react")>();
  const emptyQuery = { data: undefined, isLoading: false };
  return {
    ...actual,
    useGetDashboardSummary: () => emptyQuery,
    useGetRecentActivity: () => emptyQuery,
    useListBreedings: () => emptyQuery,
    useGetBreedBreakdown: () => emptyQuery,
    useGetHealthWorkDue: () => emptyQuery,
    useGetSettings: () => ({
      data: { dashboardLayout: farmLayout },
      isLoading: false,
    }),
    useUpdateDashboardLayout: () => ({
      mutate: updatePersonalMock,
      isPending: false,
    }),
    useUpdateSettings: () => ({ mutate: updateFarmMock, isPending: false }),
  };
});

import Dashboard from "@/pages/dashboard";

/** Only the four stat cards render by default, to keep the test DOM light. */
const VISIBLE_IDS = new Set([
  "total-goats",
  "health-status",
  "milking-status",
  "avg-milk",
]);

/**
 * A complete layout listing every catalog widget, so `resolveDashboardLayout`
 * never appends extras. Stat cards are visible; the rest are hidden. Per-widget
 * overrides let a test tweak visibility/coordinates.
 */
function baseLayout(
  overrides: Record<string, Partial<DashboardWidget>> = {},
): DashboardWidget[] {
  return DASHBOARD_WIDGETS.map((w) => ({
    id: w.id,
    visible: VISIBLE_IDS.has(w.id),
    x: w.defaultGridItem.x,
    y: w.defaultGridItem.y,
    w: w.defaultGridItem.w,
    h: w.defaultGridItem.h,
    ...(overrides[w.id] ?? {}),
  }));
}

/** A legacy saved layout: entries carry only `id` + `visible`, no coordinates. */
function legacyLayout(): DashboardWidget[] {
  return DASHBOARD_WIDGETS.map((w) => ({
    id: w.id,
    visible: VISIBLE_IDS.has(w.id),
  }));
}

function renderDashboard() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <Dashboard />
    </QueryClientProvider>,
  );
}

function savedPayload(mock: typeof updateFarmMock): DashboardWidget[] {
  return mock.mock.calls[0][0].data.dashboardLayout as DashboardWidget[];
}

beforeEach(() => {
  vi.clearAllMocks();
  gridProps = null;
  authUser = { id: 1, username: "u", role: "owner" };
  isManagerValue = true;
  farmLayout = baseLayout();
});

describe("Dashboard — edit layout lock toggle", () => {
  it("locks drag/resize until 'Edit layout', then re-locks on 'Done editing'", async () => {
    const user = userEvent.setup();
    renderDashboard();

    expect(gridProps?.isDraggable).toBe(false);
    expect(gridProps?.isResizable).toBe(false);

    await user.click(screen.getByRole("button", { name: /edit layout/i }));
    expect(gridProps?.isDraggable).toBe(true);
    expect(gridProps?.isResizable).toBe(true);

    await user.click(screen.getByRole("button", { name: /done editing/i }));
    expect(gridProps?.isDraggable).toBe(false);
    expect(gridProps?.isResizable).toBe(false);
  });
});

describe("Dashboard — drag/resize commit + save routing", () => {
  it("commits new x/y/w/h and saves the farm default when a manager has no personal override", () => {
    isManagerValue = true;
    authUser = { id: 1, username: "u", role: "owner", dashboardLayout: null };
    farmLayout = baseLayout();
    renderDashboard();

    act(() => {
      gridProps!.onDragStop([{ i: "total-goats", x: 5, y: 2, w: 4, h: 5 }]);
    });

    expect(updateFarmMock).toHaveBeenCalledTimes(1);
    expect(updatePersonalMock).not.toHaveBeenCalled();

    const moved = savedPayload(updateFarmMock).find((w) => w.id === "total-goats");
    expect(moved).toMatchObject({ x: 5, y: 2, w: 4, h: 5 });
  });

  it("saves a personal layout when a non-manager moves a widget", () => {
    isManagerValue = false;
    authUser = { id: 2, username: "hand", role: "farmhand", dashboardLayout: null };
    renderDashboard();

    act(() => {
      gridProps!.onResizeStop([{ i: "health-status", x: 3, y: 0, w: 5, h: 4 }]);
    });

    expect(updatePersonalMock).toHaveBeenCalledTimes(1);
    expect(updateFarmMock).not.toHaveBeenCalled();

    const moved = savedPayload(updatePersonalMock).find(
      (w) => w.id === "health-status",
    );
    expect(moved).toMatchObject({ x: 3, y: 0, w: 5, h: 4 });
  });

  it("saves to the personal layout when a manager already has a personal override", () => {
    isManagerValue = true;
    authUser = {
      id: 1,
      username: "u",
      role: "owner",
      dashboardLayout: baseLayout(),
    };
    renderDashboard();

    act(() => {
      gridProps!.onDragStop([{ i: "milking-status", x: 0, y: 6, w: 3, h: 3 }]);
    });

    expect(updatePersonalMock).toHaveBeenCalledTimes(1);
    expect(updateFarmMock).not.toHaveBeenCalled();
  });
});

describe("Dashboard — legacy layout forward-migration", () => {
  it("renders a legacy {id,visible} layout and fills in grid coordinates on save", () => {
    isManagerValue = false;
    authUser = {
      id: 2,
      username: "hand",
      role: "farmhand",
      dashboardLayout: legacyLayout(),
    };
    renderDashboard();

    // Even before any save, the derived grid layout has concrete coordinates
    // (drawn from the catalog defaults), not the missing values it was saved with.
    for (const item of gridProps!.layouts.lg) {
      expect(typeof item.x).toBe("number");
      expect(typeof item.y).toBe("number");
      expect(typeof item.w).toBe("number");
      expect(typeof item.h).toBe("number");
    }

    act(() => {
      gridProps!.onDragStop([{ i: "total-goats", x: 2, y: 1, w: 4, h: 4 }]);
    });

    const saved = savedPayload(updatePersonalMock);
    for (const w of saved) {
      expect(typeof w.x).toBe("number");
      expect(typeof w.y).toBe("number");
      expect(typeof w.w).toBe("number");
      expect(typeof w.h).toBe("number");
    }
    expect(saved.find((w) => w.id === "total-goats")).toMatchObject({
      x: 2,
      y: 1,
      w: 4,
      h: 4,
    });
  });
});

describe("Dashboard — hidden widgets keep their coordinates", () => {
  it("preserves a hidden widget's stored x/y/w/h when a visible widget moves", () => {
    isManagerValue = false;
    authUser = {
      id: 2,
      username: "hand",
      role: "farmhand",
      dashboardLayout: baseLayout({
        "recent-activity": { visible: false, x: 6, y: 9, w: 6, h: 6 },
      }),
    };
    renderDashboard();

    act(() => {
      gridProps!.onDragStop([{ i: "total-goats", x: 1, y: 1, w: 3, h: 3 }]);
    });

    const hidden = savedPayload(updatePersonalMock).find(
      (w) => w.id === "recent-activity",
    );
    expect(hidden).toMatchObject({
      visible: false,
      x: 6,
      y: 9,
      w: 6,
      h: 6,
    });
  });
});
