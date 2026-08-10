import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cidrRemovalDate, DEFAULT_CIDR_TREATMENT_DAYS } from "@/lib/health";

const createMutate = vi.fn();

vi.mock("@workspace/api-client-react", () => ({
  useCreateGoatHealthEvent: () => ({ mutate: createMutate, isPending: false }),
  useUpdateGoatHealthEvent: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteGoatHealthEvent: () => ({ mutate: vi.fn(), isPending: false }),
  useListGoatHealthEvents: () => ({ data: [], isLoading: false }),
  getListGoatHealthEventsQueryKey: (id: number) => ["health-events", id],
}));

vi.mock("@/lib/settings", () => ({
  useFarmSettings: () => ({ famachaThreshold: 4, weightUnit: "lb" }),
  weightUnitLabel: () => "lb",
}));

vi.mock("@/lib/auth", () => ({
  useIsManager: () => true,
}));

import { AddHealthEventDialog } from "./health-history";

// Radix Select relies on pointer-capture and scrollIntoView APIs that jsdom
// doesn't implement; stub them so the dropdown can open in tests.
beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
});

function renderDialog() {
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <AddHealthEventDialog goatId={1} goatName="Daisy" open onOpenChange={() => {}} />
    </QueryClientProvider>,
  );
}

/** Formats a date the way the dialog's removal-date line does. */
function shortDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

describe("cidrRemovalDate", () => {
  it("adds the treatment days to the insertion date", () => {
    const removal = cidrRemovalDate(new Date(2026, 6, 1), 12);
    expect(removal.getFullYear()).toBe(2026);
    expect(removal.getMonth()).toBe(6);
    expect(removal.getDate()).toBe(13);
  });

  it("rolls over month boundaries", () => {
    const removal = cidrRemovalDate(new Date(2026, 6, 25), 12);
    expect(removal.getMonth()).toBe(7);
    expect(removal.getDate()).toBe(6);
  });
});

describe("AddHealthEventDialog — CIDR", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function selectCidr(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "CIDR" }));
  }

  it("defaults the treatment length to 12 days and shows the computed removal date", async () => {
    const user = userEvent.setup();
    renderDialog();
    await selectCidr(user);

    const days = screen.getByLabelText("Days of treatment") as HTMLInputElement;
    expect(days.value).toBe(String(DEFAULT_CIDR_TREATMENT_DAYS));

    // Date defaults to today, so removal = today + 12 days.
    const expected = new Date();
    expected.setDate(expected.getDate() + DEFAULT_CIDR_TREATMENT_DAYS);
    expect(screen.getByTestId("cidr-removal-date")).toHaveTextContent(shortDate(expected));
  });

  it("recomputes the removal date as the day count changes", async () => {
    const user = userEvent.setup();
    renderDialog();
    await selectCidr(user);

    const days = screen.getByLabelText("Days of treatment");
    await user.clear(days);
    await user.type(days, "5");

    const expected = new Date();
    expected.setDate(expected.getDate() + 5);
    expect(screen.getByTestId("cidr-removal-date")).toHaveTextContent(shortDate(expected));
  });

  it("submits treatment days and co-treatments for a CIDR event", async () => {
    const user = userEvent.setup();
    renderDialog();
    await selectCidr(user);

    await user.type(screen.getByLabelText("Co-treatments (optional)"), "PG600 injection");
    await user.click(screen.getByRole("button", { name: "Save Event" }));

    expect(createMutate).toHaveBeenCalledTimes(1);
    const payload = createMutate.mock.calls[0][0];
    expect(payload.data.eventType).toBe("cidr");
    expect(payload.data.treatmentDays).toBe(DEFAULT_CIDR_TREATMENT_DAYS);
    expect(payload.data.coTreatments).toBe("PG600 injection");
  });

  it("does not send CIDR fields for other event types", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("button", { name: "Save Event" }));
    expect(createMutate).toHaveBeenCalledTimes(1);
    const payload = createMutate.mock.calls[0][0];
    expect(payload.data.eventType).toBe("hoof_trim");
    expect(payload.data.treatmentDays).toBeUndefined();
    expect(payload.data.coTreatments).toBeUndefined();
  });
});
