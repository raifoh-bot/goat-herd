import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Goat } from "@workspace/api-client-react";
import type { BulkHealthEventItem } from "@workspace/api-client-react/src/generated/api.schemas";
import { DEFAULT_FARM_NAME, type FarmSettingsValues } from "@/lib/settings";

const setLocationMock = vi.fn();
const bulkMutateMock = vi.fn();
const useFarmSettingsMock = vi.fn();
const toastMock = vi.fn();
let sessionGoats: Goat[] = [];

vi.mock("wouter", () => ({
  useLocation: () => ["/health-events/new", setLocationMock] as const,
  Link: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/components/layout", () => ({
  Layout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

vi.mock("@/lib/settings", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/settings")>();
  return {
    ...actual,
    useFarmSettings: () => useFarmSettingsMock(),
  };
});

vi.mock("@workspace/api-client-react", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@workspace/api-client-react")>();
  return {
    ...actual,
    useGetHealthEventBulkSession: () => ({
      data: sessionGoats,
      isLoading: false,
    }),
    useCreateHealthEventsBulk: () => ({
      mutate: bulkMutateMock,
      isPending: false,
    }),
  };
});

import HerdWorkDay from "./new";

// Radix Select relies on pointer-capture and scrollIntoView, neither of which
// jsdom implements. Stub them so the dropdown can open in tests.
beforeAll(() => {
  const proto = window.HTMLElement.prototype;
  proto.hasPointerCapture = vi.fn();
  proto.releasePointerCapture = vi.fn();
  proto.scrollIntoView = vi.fn();
});

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

function makeGoat(overrides: Partial<Goat> = {}): Goat {
  return {
    id: 1,
    name: "Goat",
    breed: "nubian",
    status: "healthy",
    milkPerDay: 0,
    age: 2,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function renderWizard() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <HerdWorkDay />
    </QueryClientProvider>,
  );
}

/** Capture the `events` array from the most recent bulk mutation call. */
function submittedEvents(): BulkHealthEventItem[] {
  const call = bulkMutateMock.mock.calls.at(-1);
  return call?.[0]?.data?.events ?? [];
}

const AMBER = makeGoat({ id: 1, name: "Amber" });
const BELLA = makeGoat({ id: 2, name: "Bella" });
const CLOVER = makeGoat({ id: 3, name: "Clover" });

/**
 * Walk the 3-step wizard: select every goat, pick the FAMACHA task, then set a
 * per-goat FAMACHA score. Leaves the wizard on step 3 (review) so the caller
 * can assert on the nudge, counts, and submission.
 */
async function runFamachaWizard(
  user: ReturnType<typeof userEvent.setup>,
  scores: Record<string, number>,
) {
  // Step 1 — pick goats.
  await user.click(screen.getByRole("button", { name: "Select all" }));
  await user.click(screen.getByRole("button", { name: /Next/ }));

  // Step 2 — pick the FAMACHA task.
  await user.click(screen.getByText("FAMACHA Score"));
  await user.click(screen.getByRole("button", { name: /Next/ }));

  // Step 3 — score each goat via its Radix Select.
  for (const [name, score] of Object.entries(scores)) {
    await user.click(
      screen.getByRole("combobox", { name: `FAMACHA score for ${name}` }),
    );
    await user.click(screen.getByRole("option", { name: String(score) }));
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionGoats = [AMBER, BELLA, CLOVER];
  useFarmSettingsMock.mockReturnValue(makeSettings({ famachaThreshold: 3 }));
});

describe("Herd Work Day wizard — FAMACHA deworming nudge", () => {
  it("adds a suggested deworming for every goat scored at/above the threshold", async () => {
    const user = userEvent.setup();
    renderWizard();

    // Amber (4) and Clover (3) are at/above the threshold of 3; Bella (2) is below.
    await runFamachaWizard(user, { Amber: 4, Bella: 2, Clover: 3 });

    // Only the two flagged goats surface the opt-out nudge.
    const nudges = screen.getAllByText(/also log a deworming/);
    expect(nudges).toHaveLength(2);
    expect(
      screen.getByText(/also log a deworming for Amber/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/also log a deworming for Clover/),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/also log a deworming for Bella/),
    ).not.toBeInTheDocument();

    // 3 FAMACHA events + 2 suggested dewormings = 5.
    expect(
      screen.getByRole("button", { name: "Save 5 Events" }),
    ).toBeInTheDocument();
  });

  it("drops the suggested deworming when the nudge is opted out", async () => {
    const user = userEvent.setup();
    renderWizard();

    await runFamachaWizard(user, { Amber: 4, Bella: 2, Clover: 3 });
    expect(
      screen.getByRole("button", { name: "Save 5 Events" }),
    ).toBeInTheDocument();

    // Opting Amber out removes her suggested deworming: 5 - 1 = 4.
    const amberOptOut = screen.getByRole("checkbox", {
      name: /also log a deworming for Amber/,
    });
    await user.click(amberOptOut);

    expect(
      screen.getByRole("button", { name: "Save 4 Events" }),
    ).toBeInTheDocument();
  });

  it("submits a bulk payload whose event count matches the review total", async () => {
    const user = userEvent.setup();
    renderWizard();

    await runFamachaWizard(user, { Amber: 4, Bella: 2, Clover: 3 });
    await user.click(screen.getByRole("button", { name: "Save 5 Events" }));

    const events = submittedEvents();
    expect(events).toHaveLength(5);

    // Every selected goat gets a FAMACHA event carrying its score.
    const famacha = events.filter((e) => e.eventType === "famacha");
    expect(famacha).toHaveLength(3);
    expect(famacha.find((e) => e.goatId === AMBER.id)?.famachaScore).toBe(4);
    expect(famacha.find((e) => e.goatId === BELLA.id)?.famachaScore).toBe(2);
    expect(famacha.find((e) => e.goatId === CLOVER.id)?.famachaScore).toBe(3);

    // Suggested dewormings only for the two flagged goats, carrying the score.
    const deworming = events.filter((e) => e.eventType === "deworming");
    expect(deworming.map((e) => e.goatId).sort()).toEqual([
      AMBER.id,
      CLOVER.id,
    ]);
    expect(deworming.every((e) => e.famachaScore != null)).toBe(true);
  });

  it("keeps the submitted payload in sync after opting a goat out", async () => {
    const user = userEvent.setup();
    renderWizard();

    await runFamachaWizard(user, { Amber: 4, Bella: 2, Clover: 3 });
    await user.click(
      screen.getByRole("checkbox", {
        name: /also log a deworming for Clover/,
      }),
    );
    await user.click(screen.getByRole("button", { name: "Save 4 Events" }));

    const events = submittedEvents();
    expect(events).toHaveLength(4);
    const deworming = events.filter((e) => e.eventType === "deworming");
    expect(deworming.map((e) => e.goatId)).toEqual([AMBER.id]);
  });
});
