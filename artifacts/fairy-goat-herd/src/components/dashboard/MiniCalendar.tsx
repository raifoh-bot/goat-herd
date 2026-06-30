import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Stable `YYYY-MM-DD` key for a local calendar day. */
export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

interface MiniCalendarProps {
  /** Any date within the month to render. */
  month: Date;
  /** Called with the new first-of-month when the user navigates. */
  onMonthChange: (month: Date) => void;
  /** Map of `YYYY-MM-DD` → count of events on that day. */
  markedDates: Map<string, number>;
  /** The currently selected day (highlighted), if any. */
  selectedDate?: Date | null;
  /** Called when a day cell is clicked. */
  onDateSelect: (date: Date) => void;
  /** Show the "previous month" arrow. Defaults to true. */
  showPrevButton?: boolean;
  /** Show the "next month" arrow. Defaults to true. */
  showNextButton?: boolean;
}

/**
 * A self-contained month-grid calendar. Renders a 7-column grid for the given
 * month. Prev/next arrows can be toggled independently so several calendars can
 * be composed into a multi-month view with navigation anchored to the ends.
 * Days present in `markedDates` get a dot and a count badge; clicking any day
 * emits `onDateSelect`.
 */
export function MiniCalendar({
  month,
  onMonthChange,
  markedDates,
  selectedDate,
  onDateSelect,
  showPrevButton = true,
  showNextButton = true,
}: MiniCalendarProps) {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstOfMonth = new Date(year, monthIndex, 1);
  const startWeekday = firstOfMonth.getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const todayKey = toDateKey(new Date());
  const selectedKey = selectedDate ? toDateKey(selectedDate) : null;

  const cells: (Date | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, monthIndex, d));
  while (cells.length % 7 !== 0) cells.push(null);

  const monthLabel = firstOfMonth.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        {showPrevButton ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label="Previous month"
            onClick={() => onMonthChange(new Date(year, monthIndex - 1, 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        ) : (
          <span className="h-8 w-8" aria-hidden="true" />
        )}
        <span className="text-sm font-medium text-foreground">{monthLabel}</span>
        {showNextButton ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label="Next month"
            onClick={() => onMonthChange(new Date(year, monthIndex + 1, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        ) : (
          <span className="h-8 w-8" aria-hidden="true" />
        )}
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEKDAYS.map((w) => (
          <div key={w} className="text-center text-xs font-medium text-muted-foreground py-1">
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((date, i) => {
          if (!date) return <div key={`empty-${i}`} className="aspect-square" />;
          const key = toDateKey(date);
          const count = markedDates.get(key) ?? 0;
          const isMarked = count > 0;
          const isToday = key === todayKey;
          const isSelected = key === selectedKey;

          return (
            <button
              key={key}
              type="button"
              onClick={() => onDateSelect(date)}
              aria-label={`${date.toLocaleDateString(undefined, { month: "long", day: "numeric" })}${
                isMarked ? `, ${count} kidding${count === 1 ? "" : "s"} due` : ""
              }`}
              aria-pressed={isSelected}
              className={cn(
                "relative aspect-square rounded-md flex flex-col items-center justify-center text-sm transition-colors",
                "hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isSelected && "bg-primary text-primary-foreground hover:bg-primary/90",
                !isSelected && isToday && "ring-1 ring-primary/40",
                !isSelected && isMarked && "bg-primary/10 font-medium text-foreground",
              )}
            >
              <span>{date.getDate()}</span>
              {isMarked && (
                <span
                  className={cn(
                    "absolute bottom-1 h-1.5 w-1.5 rounded-full",
                    isSelected ? "bg-primary-foreground" : "bg-primary",
                  )}
                />
              )}
              {isMarked && count > 1 && (
                <span
                  className={cn(
                    "absolute top-0.5 right-0.5 text-[10px] leading-none font-semibold px-1 rounded-full",
                    isSelected
                      ? "bg-primary-foreground text-primary"
                      : "bg-primary text-primary-foreground",
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
