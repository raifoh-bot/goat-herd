import { describe, it, expect } from "vitest";
import type { DueHealthItem } from "@workspace/api-client-react/src/generated/api.schemas";
import { deriveWorkDayPreselection } from "./new";

function item(eventType: string, status: DueHealthItem["status"]): DueHealthItem {
  return {
    eventType: eventType as DueHealthItem["eventType"],
    status,
    intervalDays: 12,
    lastEventDate: "2026-07-01T00:00:00.000Z",
    dueDate: "2026-07-13T00:00:00.000Z",
    daysOverdue: status === "overdue" ? 3 : 0,
  } as DueHealthItem;
}

describe("deriveWorkDayPreselection", () => {
  it("preselects goats and task types with overdue routine work", () => {
    const { dueGoatIds, dueTaskTypes } = deriveWorkDayPreselection({
      goats: [
        { goat: { id: 1 }, items: [item("hoof_trim", "overdue")] },
        { goat: { id: 2 }, items: [item("deworming", "never")] },
        { goat: { id: 3 }, items: [item("cdt_shot", "due-soon")] },
      ],
    });
    expect([...dueGoatIds].sort()).toEqual([1, 2]);
    expect([...dueTaskTypes].sort()).toEqual(["deworming", "hoof_trim"]);
  });

  it("never preselects CIDR removals — they are reminder-only, and the bulk endpoint rejects them", () => {
    const { dueGoatIds, dueTaskTypes } = deriveWorkDayPreselection({
      goats: [{ goat: { id: 7 }, items: [item("cidr", "overdue")] }],
    });
    expect(dueTaskTypes.has("cidr")).toBe(false);
    expect(dueTaskTypes.size).toBe(0);
    // The goat isn't pre-ticked either: her only due item can't be batch work.
    expect(dueGoatIds.size).toBe(0);
  });

  it("still preselects a goat's routine work when she also has a CIDR removal due", () => {
    const { dueGoatIds, dueTaskTypes } = deriveWorkDayPreselection({
      goats: [
        { goat: { id: 5 }, items: [item("cidr", "overdue"), item("hoof_trim", "overdue")] },
      ],
    });
    expect(dueGoatIds.has(5)).toBe(true);
    expect([...dueTaskTypes]).toEqual(["hoof_trim"]);
  });
});
