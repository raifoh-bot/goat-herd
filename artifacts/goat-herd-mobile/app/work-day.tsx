import { Feather } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetHealthEventBulkSessionQueryKey,
  getGetHealthWorkDueQueryKey,
  getListGoatHealthEventsQueryKey,
  useCreateHealthEventsBulk,
  useGetHealthEventBulkSession,
  useGetHealthWorkDue,
} from "@workspace/api-client-react";
import type {
  BulkHealthEventItem,
  DueHealthItem,
  HealthEventEventType,
} from "@workspace/api-client-react/src/generated/api.schemas";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Badge, Button, Card, EmptyState, LoadingState, StepDots } from "@/components/ui";
import {
  DEFAULT_FAMACHA_THRESHOLD,
  DOSAGE_TYPES,
  dateInputToIso,
  dueItemLabel,
  eventTypeLabel,
  formatLongDate,
  HEALTH_EVENT_TYPES,
  isActionable,
  todayInputValue,
} from "@/constants/domain";
import { useColors } from "@/hooks/useColors";

const STEPS = ["Select goats", "Choose tasks", "Score & review"] as const;
const FAMACHA_THRESHOLD = DEFAULT_FAMACHA_THRESHOLD;

export default function WorkDayScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: goats, isLoading } = useGetHealthEventBulkSession({
    query: { queryKey: getGetHealthEventBulkSessionQueryKey() },
  });
  const { data: dueData } = useGetHealthWorkDue({
    query: { queryKey: getGetHealthWorkDueQueryKey(), staleTime: 30_000 },
  });
  const bulkCreate = useCreateHealthEventsBulk();

  const [step, setStep] = useState(0);
  const [search, setSearch] = useState("");
  const [selectedGoatIds, setSelectedGoatIds] = useState<Set<number>>(new Set());
  const [selectedTypes, setSelectedTypes] = useState<Set<HealthEventEventType>>(new Set());
  const [productByType, setProductByType] = useState<Partial<Record<HealthEventEventType, string>>>({});
  const [dosageByType, setDosageByType] = useState<Partial<Record<HealthEventEventType, string>>>({});
  const [famachaScores, setFamachaScores] = useState<Record<number, string>>({});
  const [weightByGoat, setWeightByGoat] = useState<Record<number, string>>({});
  const [dewormOptOut, setDewormOptOut] = useState<Set<number>>(new Set());

  const eventDate = todayInputValue();

  const allGoats = useMemo(() => goats ?? [], [goats]);
  const filteredGoats = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allGoats;
    return allGoats.filter((g) => g.name.toLowerCase().includes(q));
  }, [allGoats, search]);
  const selectedGoats = useMemo(
    () => allGoats.filter((g) => selectedGoatIds.has(g.id)),
    [allGoats, selectedGoatIds],
  );

  const dueByGoat = useMemo(() => {
    const map = new Map<number, DueHealthItem[]>();
    for (const entry of dueData?.goats ?? []) map.set(entry.goat.id, entry.items);
    return map;
  }, [dueData]);

  // Goats and task types that need action now — these drive the one-time
  // pre-selection so a farmer starts with the right goats and tasks ticked.
  const { dueGoatIds, dueTaskTypes } = useMemo(() => {
    const goatIds = new Set<number>();
    const taskTypes = new Set<HealthEventEventType>();
    for (const entry of dueData?.goats ?? []) {
      const actionable = entry.items.filter(isActionable);
      if (actionable.length === 0) continue;
      goatIds.add(entry.goat.id);
      for (const item of actionable)
        taskTypes.add(item.eventType as HealthEventEventType);
    }
    return { dueGoatIds: goatIds, dueTaskTypes: taskTypes };
  }, [dueData]);

  const didPreselect = useRef(false);
  useEffect(() => {
    if (didPreselect.current || !dueData) return;
    didPreselect.current = true;
    if (dueGoatIds.size > 0) setSelectedGoatIds(new Set(dueGoatIds));
    if (dueTaskTypes.size > 0) setSelectedTypes(new Set(dueTaskTypes));
  }, [dueData, dueGoatIds, dueTaskTypes]);

  const famachaSelected = selectedTypes.has("famacha");
  const dewormingSelected = selectedTypes.has("deworming");

  // Goats whose FAMACHA score meets the threshold get a suggested deworming
  // event (opt-out), unless deworming is already a task for everyone.
  const flaggedGoatIds = useMemo(() => {
    if (!famachaSelected || dewormingSelected) return new Set<number>();
    const flagged = new Set<number>();
    for (const g of selectedGoats) {
      const score = Number(famachaScores[g.id]);
      if (score >= FAMACHA_THRESHOLD) flagged.add(g.id);
    }
    return flagged;
  }, [famachaSelected, dewormingSelected, selectedGoats, famachaScores]);

  const totalEvents = useMemo(() => {
    let count = selectedGoats.length * selectedTypes.size;
    for (const id of flaggedGoatIds) if (!dewormOptOut.has(id)) count += 1;
    return count;
  }, [selectedGoats.length, selectedTypes.size, flaggedGoatIds, dewormOptOut]);

  const toggleGoat = (id: number) =>
    setSelectedGoatIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleType = (type: HealthEventEventType) =>
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      next.has(type) ? next.delete(type) : next.add(type);
      return next;
    });

  const toggleOptOut = (id: number) =>
    setDewormOptOut((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const submit = () => {
    const events: BulkHealthEventItem[] = [];
    for (const goat of selectedGoats) {
      const weightStr = weightByGoat[goat.id];
      const weight = weightStr ? Number(weightStr) : null;
      const hasWeight = weight != null && weight > 0;
      for (const type of selectedTypes) {
        const item: BulkHealthEventItem = { goatId: goat.id, eventType: type };
        if (type === "famacha" || type === "deworming") {
          const score = Number(famachaScores[goat.id]);
          if (score >= 1 && score <= 5) item.famachaScore = score;
        }
        const product = productByType[type]?.trim();
        if (product) item.productName = product;
        const doseStr = dosageByType[type];
        const dose = doseStr ? Number(doseStr) : null;
        if (dose != null && dose > 0) item.dosageMl = dose;
        if (hasWeight) item.bodyWeight = weight;
        events.push(item);
      }
      if (flaggedGoatIds.has(goat.id) && !dewormOptOut.has(goat.id)) {
        const score = Number(famachaScores[goat.id]);
        events.push({
          goatId: goat.id,
          eventType: "deworming",
          ...(score >= 1 && score <= 5 ? { famachaScore: score } : {}),
          ...(hasWeight ? { bodyWeight: weight } : {}),
        });
      }
    }

    bulkCreate.mutate(
      { data: { eventDate: dateInputToIso(eventDate), events } },
      {
        onSuccess: (res) => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          for (const goat of selectedGoats) {
            queryClient.invalidateQueries({
              queryKey: getListGoatHealthEventsQueryKey(goat.id),
            });
          }
          queryClient.invalidateQueries({ queryKey: getGetHealthWorkDueQueryKey() });
          Alert.alert(
            "Herd work day logged",
            `${res.created} health event${res.created === 1 ? "" : "s"} recorded for ${selectedGoats.length} goat${selectedGoats.length === 1 ? "" : "s"}.`,
            [{ text: "Done", onPress: () => router.back() }],
          );
        },
        onError: () =>
          Alert.alert(
            "Could not save",
            "The work day could not be recorded. Please try again.",
          ),
      },
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={styles.stepHeader}>
        <StepDots step={step} total={STEPS.length} />
        <Text style={[styles.stepLabel, { color: colors.mutedForeground }]}>
          Step {step + 1} of {STEPS.length} · {STEPS[step]}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 100 }]}
        keyboardShouldPersistTaps="handled"
      >
        {step === 0 && (
          <StepSelectGoats
            isLoading={isLoading}
            search={search}
            setSearch={setSearch}
            filteredGoats={filteredGoats}
            allGoats={allGoats}
            selectedGoatIds={selectedGoatIds}
            setSelectedGoatIds={setSelectedGoatIds}
            toggleGoat={toggleGoat}
            dueByGoat={dueByGoat}
            preselectedCount={dueGoatIds.size}
          />
        )}
        {step === 1 && (
          <StepChooseTasks
            eventDate={eventDate}
            selectedTypes={selectedTypes}
            toggleType={toggleType}
            productByType={productByType}
            setProductByType={setProductByType}
            dosageByType={dosageByType}
            setDosageByType={setDosageByType}
          />
        )}
        {step === 2 && (
          <StepReview
            selectedGoats={selectedGoats}
            selectedTypes={selectedTypes}
            eventDate={eventDate}
            totalEvents={totalEvents}
            famachaSelected={famachaSelected}
            famachaScores={famachaScores}
            setFamachaScores={setFamachaScores}
            weightByGoat={weightByGoat}
            setWeightByGoat={setWeightByGoat}
            flaggedGoatIds={flaggedGoatIds}
            dewormOptOut={dewormOptOut}
            toggleOptOut={toggleOptOut}
          />
        )}
      </ScrollView>

      <View
        style={[
          styles.footer,
          { paddingBottom: insets.bottom + 12, backgroundColor: colors.background, borderTopColor: colors.border },
        ]}
      >
        {step > 0 ? (
          <Button label="Back" variant="outline" icon="arrow-left" onPress={() => setStep((s) => s - 1)} />
        ) : (
          <View />
        )}
        {step < 2 ? (
          <Button
            label="Next"
            iconRight="arrow-right"
            onPress={() => setStep((s) => s + 1)}
            disabled={step === 0 ? selectedGoatIds.size === 0 : selectedTypes.size === 0}
          />
        ) : (
          <Button
            label={`Save ${totalEvents} event${totalEvents === 1 ? "" : "s"}`}
            icon="check"
            onPress={submit}
            loading={bulkCreate.isPending}
            disabled={totalEvents === 0}
            testID="save-work-day"
          />
        )}
      </View>
    </View>
  );
}

// --- Step 1: select goats -------------------------------------------------

function StepSelectGoats({
  isLoading,
  search,
  setSearch,
  filteredGoats,
  allGoats,
  selectedGoatIds,
  setSelectedGoatIds,
  toggleGoat,
  dueByGoat,
  preselectedCount,
}: {
  isLoading: boolean;
  search: string;
  setSearch: (v: string) => void;
  filteredGoats: { id: number; name: string }[];
  allGoats: { id: number }[];
  selectedGoatIds: Set<number>;
  setSelectedGoatIds: (s: Set<number>) => void;
  toggleGoat: (id: number) => void;
  dueByGoat: Map<number, DueHealthItem[]>;
  preselectedCount: number;
}) {
  const colors = useColors();
  return (
    <View style={styles.stepBody}>
      <Text style={[styles.h1, { color: colors.foreground }]}>
        Which goats did you work?
      </Text>

      {preselectedCount > 0 ? (
        <Card style={[styles.hint, { backgroundColor: colors.warningBg, borderColor: colors.warningBorder }]}>
          <Feather name="calendar" size={18} color={colors.warning} />
          <Text style={[styles.hintText, { color: colors.warningForeground }]}>
            {preselectedCount} due goat{preselectedCount === 1 ? "" : "s"} pre-selected. Adjust below.
          </Text>
        </Card>
      ) : null}

      <View style={[styles.searchRow, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
        <Feather name="search" size={18} color={colors.mutedForeground} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search goats…"
          placeholderTextColor={colors.mutedForeground}
          style={[styles.searchInput, { color: colors.foreground }]}
          autoCapitalize="none"
        />
      </View>

      <View style={styles.selectRow}>
        <Text style={[styles.count, { color: colors.mutedForeground }]}>
          {selectedGoatIds.size} selected
        </Text>
        <View style={styles.selectActions}>
          <Button label="All" variant="ghost" onPress={() => setSelectedGoatIds(new Set(allGoats.map((g) => g.id)))} />
          <Button label="Clear" variant="ghost" onPress={() => setSelectedGoatIds(new Set())} />
        </View>
      </View>

      {isLoading ? (
        <LoadingState />
      ) : filteredGoats.length === 0 ? (
        <EmptyState
          icon="search"
          title={allGoats.length === 0 ? "No active goats" : "No matches"}
          subtitle={allGoats.length === 0 ? "There are no on-farm goats to work." : "Try a different search."}
        />
      ) : (
        <View style={styles.goatList}>
          {filteredGoats.map((goat) => {
            const selected = selectedGoatIds.has(goat.id);
            const due = dueByGoat.get(goat.id) ?? [];
            return (
              <SelectableRow key={goat.id} selected={selected} onPress={() => toggleGoat(goat.id)}>
                <Text style={[styles.goatName, { color: colors.foreground }]}>{goat.name}</Text>
                {due.length > 0 ? (
                  <View style={styles.badgeRow}>
                    {due.map((item) => (
                      <Badge key={item.eventType} label={dueItemLabel(item)} tone={isActionable(item) ? "warning" : "muted"} />
                    ))}
                  </View>
                ) : null}
              </SelectableRow>
            );
          })}
        </View>
      )}
    </View>
  );
}

// --- Step 2: choose tasks -------------------------------------------------

function StepChooseTasks({
  eventDate,
  selectedTypes,
  toggleType,
  productByType,
  setProductByType,
  dosageByType,
  setDosageByType,
}: {
  eventDate: string;
  selectedTypes: Set<HealthEventEventType>;
  toggleType: (t: HealthEventEventType) => void;
  productByType: Partial<Record<HealthEventEventType, string>>;
  setProductByType: React.Dispatch<React.SetStateAction<Partial<Record<HealthEventEventType, string>>>>;
  dosageByType: Partial<Record<HealthEventEventType, string>>;
  setDosageByType: React.Dispatch<React.SetStateAction<Partial<Record<HealthEventEventType, string>>>>;
}) {
  const colors = useColors();
  return (
    <View style={styles.stepBody}>
      <Text style={[styles.h1, { color: colors.foreground }]}>What was done?</Text>
      <Text style={[styles.dateNote, { color: colors.mutedForeground }]}>
        Recording for {formatLongDate(eventDate)}
      </Text>

      <View style={styles.taskList}>
        {HEALTH_EVENT_TYPES.map((t) => {
          const active = selectedTypes.has(t.value);
          const showInputs = active && DOSAGE_TYPES.includes(t.value);
          return (
            <SelectableRow key={t.value} selected={active} onPress={() => toggleType(t.value)}>
              <View style={styles.taskHeader}>
                <Feather name={t.icon} size={18} color={active ? colors.primary : colors.mutedForeground} />
                <Text style={[styles.taskLabel, { color: colors.foreground }]}>{t.label}</Text>
              </View>
              {showInputs ? (
                <View style={styles.taskInputs}>
                  <TextInput
                    value={productByType[t.value] ?? ""}
                    onChangeText={(v) => setProductByType((p) => ({ ...p, [t.value]: v }))}
                    placeholder="Product (optional)"
                    placeholderTextColor={colors.mutedForeground}
                    style={[styles.smallInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius }]}
                    autoCapitalize="none"
                  />
                  <TextInput
                    value={dosageByType[t.value] ?? ""}
                    onChangeText={(v) => setDosageByType((p) => ({ ...p, [t.value]: v }))}
                    placeholder="Dose mL"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="decimal-pad"
                    style={[styles.smallInput, styles.doseInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius }]}
                  />
                </View>
              ) : null}
            </SelectableRow>
          );
        })}
      </View>
    </View>
  );
}

// --- Step 3: score & review ----------------------------------------------

function StepReview({
  selectedGoats,
  selectedTypes,
  eventDate,
  totalEvents,
  famachaSelected,
  famachaScores,
  setFamachaScores,
  weightByGoat,
  setWeightByGoat,
  flaggedGoatIds,
  dewormOptOut,
  toggleOptOut,
}: {
  selectedGoats: { id: number; name: string }[];
  selectedTypes: Set<HealthEventEventType>;
  eventDate: string;
  totalEvents: number;
  famachaSelected: boolean;
  famachaScores: Record<number, string>;
  setFamachaScores: React.Dispatch<React.SetStateAction<Record<number, string>>>;
  weightByGoat: Record<number, string>;
  setWeightByGoat: React.Dispatch<React.SetStateAction<Record<number, string>>>;
  flaggedGoatIds: Set<number>;
  dewormOptOut: Set<number>;
  toggleOptOut: (id: number) => void;
}) {
  const colors = useColors();
  const taskSummary = [...selectedTypes].map(eventTypeLabel).join(", ");

  return (
    <View style={styles.stepBody}>
      <Text style={[styles.h1, { color: colors.foreground }]}>
        {famachaSelected ? "Score & review" : "Review & save"}
      </Text>

      <Card style={[styles.summaryCard, { backgroundColor: colors.muted, borderColor: colors.border }]}>
        <Text style={[styles.summaryStrong, { color: colors.foreground }]}>
          {selectedGoats.length} goat{selectedGoats.length === 1 ? "" : "s"} · {taskSummary}
        </Text>
        <Text style={[styles.summaryMuted, { color: colors.mutedForeground }]}>
          {totalEvents} event{totalEvents === 1 ? "" : "s"} for {formatLongDate(eventDate)}
        </Text>
      </Card>

      {famachaSelected ? (
        <Text style={[styles.famachaHint, { color: colors.mutedForeground }]}>
          FAMACHA: 1 = healthy, 5 = severely anemic. Scores of {FAMACHA_THRESHOLD}+ suggest a deworming.
        </Text>
      ) : null}

      <View style={styles.reviewList}>
        {selectedGoats.map((goat) => {
          const score = famachaScores[goat.id];
          const flagged = flaggedGoatIds.has(goat.id);
          const optedOut = dewormOptOut.has(goat.id);
          return (
            <Card
              key={goat.id}
              style={[
                styles.reviewCard,
                flagged
                  ? { borderColor: colors.warningBorder, backgroundColor: colors.warningBg }
                  : undefined,
              ]}
            >
              <Text style={[styles.goatName, { color: colors.foreground }]}>{goat.name}</Text>

              {famachaSelected ? (
                <View style={styles.famachaRow}>
                  <Text style={[styles.fieldMini, { color: colors.mutedForeground }]}>FAMACHA</Text>
                  <View style={styles.scorePills}>
                    {[1, 2, 3, 4, 5].map((s) => {
                      const active = score === String(s);
                      return (
                        <Pressable
                          key={s}
                          onPress={() => setFamachaScores((p) => ({ ...p, [goat.id]: String(s) }))}
                          style={[
                            styles.scorePill,
                            {
                              backgroundColor: active ? colors.primary : colors.background,
                              borderColor: active ? colors.primary : colors.border,
                            },
                          ]}
                        >
                          <Text style={{ color: active ? colors.primaryForeground : colors.foreground, fontFamily: "Inter_600SemiBold" }}>
                            {s}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ) : null}

              <View style={styles.weightRow}>
                <Text style={[styles.fieldMini, { color: colors.mutedForeground }]}>Weight</Text>
                <TextInput
                  value={weightByGoat[goat.id] ?? ""}
                  onChangeText={(v) => setWeightByGoat((p) => ({ ...p, [goat.id]: v }))}
                  placeholder="optional"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="decimal-pad"
                  style={[styles.weightInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground, borderRadius: colors.radius }]}
                />
              </View>

              {flagged ? (
                <Pressable style={styles.optOutRow} onPress={() => toggleOptOut(goat.id)}>
                  <Feather
                    name={optedOut ? "square" : "check-square"}
                    size={18}
                    color={optedOut ? colors.mutedForeground : colors.warning}
                  />
                  <Text style={[styles.optOutText, { color: colors.warningForeground }]}>
                    Add suggested deworming
                  </Text>
                </Pressable>
              ) : null}
            </Card>
          );
        })}
      </View>
    </View>
  );
}

// --- Shared selectable row ------------------------------------------------

function SelectableRow({
  selected,
  onPress,
  children,
}: {
  selected: boolean;
  onPress: () => void;
  children: React.ReactNode;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.selectable,
        {
          borderColor: selected ? colors.primary : colors.border,
          backgroundColor: selected ? colors.muted : colors.card,
          borderRadius: colors.radius,
        },
      ]}
    >
      <View style={styles.checkbox}>
        <Feather
          name={selected ? "check-square" : "square"}
          size={20}
          color={selected ? colors.primary : colors.mutedForeground}
        />
      </View>
      <View style={styles.flex}>{children}</View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  stepHeader: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, gap: 8 },
  stepLabel: { fontFamily: "Inter_500Medium", fontSize: 13 },
  scroll: { paddingHorizontal: 16, paddingTop: 8 },
  stepBody: { gap: 12 },
  h1: { fontFamily: "Inter_700Bold", fontSize: 22 },
  hint: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12 },
  hintText: { fontFamily: "Inter_500Medium", fontSize: 13, flex: 1 },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
  },
  searchInput: { flex: 1, paddingVertical: 12, fontFamily: "Inter_400Regular", fontSize: 15 },
  selectRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  selectActions: { flexDirection: "row" },
  count: { fontFamily: "Inter_500Medium", fontSize: 14 },
  goatList: { gap: 8 },
  goatName: { fontFamily: "Inter_600SemiBold", fontSize: 16 },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  selectable: {
    flexDirection: "row",
    borderWidth: 1,
    padding: 14,
    gap: 12,
    alignItems: "flex-start",
  },
  checkbox: { paddingTop: 1 },
  dateNote: { fontFamily: "Inter_400Regular", fontSize: 14, marginTop: -4 },
  taskList: { gap: 8 },
  taskHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  taskLabel: { fontFamily: "Inter_600SemiBold", fontSize: 16 },
  taskInputs: { flexDirection: "row", gap: 8, marginTop: 10 },
  smallInput: {
    flex: 1,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
  },
  doseInput: { flex: 0, width: 96 },
  summaryCard: { gap: 4 },
  summaryStrong: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  summaryMuted: { fontFamily: "Inter_400Regular", fontSize: 13 },
  famachaHint: { fontFamily: "Inter_400Regular", fontSize: 13, marginTop: -4 },
  reviewList: { gap: 8 },
  reviewCard: { gap: 12 },
  famachaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  fieldMini: { fontFamily: "Inter_500Medium", fontSize: 13 },
  scorePills: { flexDirection: "row", gap: 6 },
  scorePill: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  weightRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  weightInput: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    width: 120,
    textAlign: "right",
  },
  optOutRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  optOutText: { fontFamily: "Inter_500Medium", fontSize: 14 },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    gap: 12,
  },
});
