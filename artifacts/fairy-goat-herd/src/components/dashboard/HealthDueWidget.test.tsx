import { describe, it, expect, vi } from "vitest";
import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import type {
  DueHealthItem,
  Goat,
  HealthDueResponse,
} from "@workspace/api-client-react";
import { HealthDueWidget, hasHealthSchedules } from "./HealthDueWidget";

vi.mock("wouter", () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

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
  } as Goat;
}

function item(overrides: Partial<DueHealthItem> = {}): DueHealthItem {
  return {
    eventType: "hoof_trim",
    status: "overdue",
    intervalDays: 90,
    lastEventDate: "2024-01-01T00:00:00.000Z",
    dueDate: "2024-04-01T00:00:00.000Z",
    daysOverdue: 10,
    ...overrides,
  };
}

const CONFIGURED = { hoof_trim: 90, cdt_shot: 365 };

describe("hasHealthSchedules", () => {
  it("is false without data or configured intervals", () => {
    expect(hasHealthSchedules(undefined)).toBe(false);
    expect(hasHealthSchedules({ intervals: {}, goats: [] })).toBe(false);
  });

  it("is true when at least one interval is configured", () => {
    expect(hasHealthSchedules({ intervals: CONFIGURED, goats: [] })).toBe(true);
  });
});

describe("HealthDueWidget", () => {
  it("surfaces due-soon-only work instead of the caught-up state", () => {
    const soon = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const data: HealthDueResponse = {
      intervals: CONFIGURED,
      goats: [
        {
          goat: makeGoat({ id: 1, name: "Bella" }),
          items: [item({ status: "due-soon", daysOverdue: 0, dueDate: soon })],
        },
      ],
    };
    render(<HealthDueWidget data={data} isLoading={false} />);

    expect(screen.queryByText(/All caught up/i)).not.toBeInTheDocument();
    expect(screen.getByText("Bella")).toBeInTheDocument();
    expect(screen.getByText("1 due soon")).toBeInTheDocument();
  });

  it("shows overdue and due-soon summaries together, overdue first", () => {
    const soon = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
    const data: HealthDueResponse = {
      intervals: CONFIGURED,
      goats: [
        {
          goat: makeGoat({ id: 1, name: "Amber" }),
          items: [item({ status: "due-soon", daysOverdue: 0, dueDate: soon })],
        },
        {
          goat: makeGoat({ id: 2, name: "Clover" }),
          items: [item({ status: "overdue", daysOverdue: 20 })],
        },
      ],
    };
    render(<HealthDueWidget data={data} isLoading={false} />);

    expect(screen.getByText("1 task due now")).toBeInTheDocument();
    expect(screen.getByText("1 due soon")).toBeInTheDocument();
    expect(screen.getByText("20d overdue")).toBeInTheDocument();

    const names = screen.getAllByRole("heading", { level: 4 }).map((n) => n.textContent);
    expect(names).toEqual(["Clover", "Amber"]);
  });

  it("shows the caught-up empty state when nothing is due", () => {
    const data: HealthDueResponse = { intervals: CONFIGURED, goats: [] };
    render(<HealthDueWidget data={data} isLoading={false} />);
    expect(screen.getByText(/All caught up/i)).toBeInTheDocument();
  });
});
