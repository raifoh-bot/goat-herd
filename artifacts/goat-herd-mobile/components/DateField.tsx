import { Feather } from "@expo/vector-icons";
import React, { useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { formatLongDate, todayInputValue } from "@/constants/domain";
import { useColors } from "@/hooks/useColors";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

function toValue(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function parseValue(value: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]) - 1;
  const d = Number(match[3]);
  if (m < 0 || m > 11 || d < 1 || d > 31) return null;
  return { y, m, d };
}

/**
 * A tap-to-pick date field: shows the selected date as a button and opens a
 * calendar modal on tap. Value is always a `YYYY-MM-DD` string, so it plugs
 * into the existing `dateInputToIso()` flow. Works on iOS, Android, and web.
 */
export function DateField({
  label,
  value,
  onChange,
  testID,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  testID?: string;
}) {
  const colors = useColors();
  const [open, setOpen] = useState(false);

  const parsed = parseValue(value);
  const today = parseValue(todayInputValue())!;
  const initial = parsed ?? today;

  const [viewYear, setViewYear] = useState(initial.y);
  const [viewMonth, setViewMonth] = useState(initial.m);

  const openPicker = () => {
    const p = parseValue(value) ?? today;
    setViewYear(p.y);
    setViewMonth(p.m);
    setOpen(true);
  };

  const shiftMonth = (delta: number) => {
    const next = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  };

  const weeks = useMemo(() => {
    const first = new Date(viewYear, viewMonth, 1);
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const cells: (number | null)[] = [];
    for (let i = 0; i < first.getDay(); i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    const rows: (number | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  }, [viewYear, viewMonth]);

  const displayText = parsed ? formatLongDate(value.trim()) : "Pick a date";

  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.mutedForeground }]}>
        {label}
      </Text>
      <Pressable
        onPress={openPicker}
        style={[
          styles.trigger,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            borderRadius: colors.radius,
          },
        ]}
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${displayText}. Tap to pick a date.`}
      >
        <Feather name="calendar" size={18} color={colors.mutedForeground} />
        <Text
          style={[
            styles.triggerText,
            { color: parsed ? colors.foreground : colors.mutedForeground },
          ]}
        >
          {displayText}
        </Text>
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable
            style={[
              styles.sheet,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                borderRadius: Math.max(colors.radius, 12),
              },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.header}>
              <Pressable
                onPress={() => shiftMonth(-1)}
                hitSlop={10}
                accessibilityLabel="Previous month"
                testID={testID ? `${testID}-prev-month` : undefined}
              >
                <Feather name="chevron-left" size={22} color={colors.foreground} />
              </Pressable>
              <Text style={[styles.headerText, { color: colors.foreground }]}>
                {MONTHS[viewMonth]} {viewYear}
              </Text>
              <Pressable
                onPress={() => shiftMonth(1)}
                hitSlop={10}
                accessibilityLabel="Next month"
                testID={testID ? `${testID}-next-month` : undefined}
              >
                <Feather name="chevron-right" size={22} color={colors.foreground} />
              </Pressable>
            </View>

            <View style={styles.weekRow}>
              {WEEKDAYS.map((w, i) => (
                <Text
                  key={`${w}-${i}`}
                  style={[styles.weekday, { color: colors.mutedForeground }]}
                >
                  {w}
                </Text>
              ))}
            </View>

            {weeks.map((row, ri) => (
              <View key={ri} style={styles.weekRow}>
                {row.map((day, ci) => {
                  if (day === null) {
                    return <View key={ci} style={styles.dayCell} />;
                  }
                  const isSelected =
                    !!parsed &&
                    parsed.y === viewYear &&
                    parsed.m === viewMonth &&
                    parsed.d === day;
                  const isToday =
                    today.y === viewYear &&
                    today.m === viewMonth &&
                    today.d === day;
                  return (
                    <Pressable
                      key={ci}
                      onPress={() => {
                        onChange(toValue(viewYear, viewMonth, day));
                        setOpen(false);
                      }}
                      style={[
                        styles.dayCell,
                        isSelected && { backgroundColor: colors.primary },
                        !isSelected &&
                          isToday && {
                            borderWidth: 1,
                            borderColor: colors.primary,
                          },
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={formatLongDate(
                        toValue(viewYear, viewMonth, day),
                      )}
                      testID={
                        testID ? `${testID}-day-${day}` : undefined
                      }
                    >
                      <Text
                        style={{
                          fontFamily: isSelected
                            ? "Inter_700Bold"
                            : "Inter_400Regular",
                          fontSize: 15,
                          color: isSelected
                            ? colors.primaryForeground
                            : colors.foreground,
                        }}
                      >
                        {day}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ))}

            <Pressable
              onPress={() => {
                onChange(todayInputValue());
                setOpen(false);
              }}
              style={styles.todayButton}
              testID={testID ? `${testID}-today` : undefined}
            >
              <Text
                style={{
                  fontFamily: "Inter_500Medium",
                  fontSize: 14,
                  color: colors.primary,
                }}
              >
                Today
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {},
  label: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    marginBottom: 6,
  },
  trigger: {
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  triggerText: {
    fontFamily: "Inter_400Regular",
    fontSize: 16,
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    padding: 24,
  },
  sheet: {
    borderWidth: 1,
    padding: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  headerText: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
  },
  weekRow: {
    flexDirection: "row",
  },
  weekday: {
    flex: 1,
    textAlign: "center",
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    marginBottom: 4,
  },
  dayCell: {
    flex: 1,
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    margin: 1,
  },
  todayButton: {
    alignSelf: "center",
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
});
