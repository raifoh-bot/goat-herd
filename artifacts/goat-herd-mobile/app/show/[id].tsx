import { Feather } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetShowQueryKey,
  getListGoatsQueryKey,
  getListShowsQueryKey,
  useCreateShowResults,
  useDeleteShow,
  useGetShow,
  useListGoats,
  useUpdateShow,
} from "@workspace/api-client-react";
import type {
  Goat,
  ShowResultWithGoat,
} from "@workspace/api-client-react/src/generated/api.schemas";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { DateField } from "@/components/DateField";
import { Badge, Button, Card, EmptyState, LoadingState } from "@/components/ui";
import { dateInputToIso, formatIsoDate } from "@/constants/domain";
import { useIsManager } from "@/context/auth";
import { useColors } from "@/hooks/useColors";

const PLACEMENTS = [
  "1st Place",
  "2nd Place",
  "3rd Place",
  "4th Place",
  "Best in Show",
  "Reserve Champion",
  "Other",
];

interface DraftResult {
  key: number;
  goatId: number;
  goatName: string;
  judgeName: string;
  classDivision: string;
  placement: string;
  awardRibbon: string;
  notes: string;
}

export default function ShowDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const isManager = useIsManager();

  const { id } = useLocalSearchParams<{ id: string }>();
  const showId = Number(id);

  const { data: show, isLoading } = useGetShow(showId, {
    query: { queryKey: getGetShowQueryKey(showId), enabled: Number.isFinite(showId) },
  });
  const { data: goats } = useListGoats(
    { status: "on-farm" },
    {
      query: {
        queryKey: getListGoatsQueryKey({ status: "on-farm" }),
        enabled: isManager,
      },
    },
  );
  const sortedGoats = useMemo(
    () => [...(goats ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [goats],
  );

  const createResults = useCreateShowResults();
  const updateShow = useUpdateShow();
  const deleteShow = useDeleteShow();

  const [drafts, setDrafts] = useState<DraftResult[]>([]);
  const [nextKey, setNextKey] = useState(1);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editNotes, setEditNotes] = useState("");

  const openEdit = () => {
    if (!show) return;
    setEditName(show.name);
    setEditLocation(show.location ?? "");
    setEditDate(isoToDateInput(show.showDate));
    setEditNotes(show.notes ?? "");
    setEditOpen(true);
  };

  const canSaveEdit = editName.trim().length > 0 && editDate.trim().length > 0;

  const saveEdit = () => {
    updateShow.mutate(
      {
        id: showId,
        data: {
          name: editName.trim(),
          location: editLocation.trim() || null,
          showDate: dateInputToIso(editDate.trim()),
          notes: editNotes.trim() || null,
        },
      },
      {
        onSuccess: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setEditOpen(false);
          queryClient.invalidateQueries({ queryKey: getGetShowQueryKey(showId) });
          queryClient.invalidateQueries({ queryKey: getListShowsQueryKey() });
        },
        onError: () =>
          Alert.alert(
            "Could not save",
            "The show details could not be updated. Please try again.",
          ),
      },
    );
  };

  const confirmDelete = () => {
    if (!show) return;
    const resultCount = show.results.length;
    Alert.alert(
      "Delete this show?",
      resultCount > 0
        ? `"${show.name}" and its ${resultCount} recorded result${resultCount === 1 ? "" : "s"} will be permanently deleted.`
        : `"${show.name}" will be permanently deleted.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () =>
            deleteShow.mutate(
              { id: showId },
              {
                onSuccess: () => {
                  Haptics.notificationAsync(
                    Haptics.NotificationFeedbackType.Success,
                  );
                  queryClient.invalidateQueries({
                    queryKey: getListShowsQueryKey(),
                  });
                  queryClient.removeQueries({
                    queryKey: getGetShowQueryKey(showId),
                  });
                  router.back();
                },
                onError: () =>
                  Alert.alert(
                    "Could not delete",
                    "The show could not be deleted. Please try again.",
                  ),
              },
            ),
        },
      ],
    );
  };

  const addDraft = (goat: Goat) => {
    setDrafts((prev) => [
      ...prev,
      {
        key: nextKey,
        goatId: goat.id,
        goatName: goat.name,
        judgeName: "",
        classDivision: "",
        placement: "",
        awardRibbon: "",
        notes: "",
      },
    ]);
    setNextKey((k) => k + 1);
    setPickerOpen(false);
  };

  const updateDraft = (key: number, patch: Partial<DraftResult>) =>
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)));

  const removeDraft = (key: number) =>
    setDrafts((prev) => prev.filter((d) => d.key !== key));

  const saveDrafts = () => {
    createResults.mutate(
      {
        id: showId,
        data: {
          results: drafts.map((d) => ({
            goatId: d.goatId,
            judgeName: d.judgeName.trim() || undefined,
            classDivision: d.classDivision.trim() || undefined,
            placement: d.placement.trim() || undefined,
            awardRibbon: d.awardRibbon.trim() || undefined,
            notes: d.notes.trim() || undefined,
          })),
        },
      },
      {
        onSuccess: (created) => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setDrafts([]);
          queryClient.invalidateQueries({ queryKey: getGetShowQueryKey(showId) });
          queryClient.invalidateQueries({ queryKey: getListShowsQueryKey() });
          Alert.alert(
            "Results saved",
            `Recorded ${created.length} result${created.length === 1 ? "" : "s"} for this show.`,
          );
        },
        onError: () =>
          Alert.alert(
            "Could not save",
            "The results could not be saved. Please try again.",
          ),
      },
    );
  };

  if (isLoading || !show) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <LoadingState label="Loading show…" />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + (isManager ? 110 : 24) },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.titleRow}>
          <Text style={[styles.h1, styles.titleText, { color: colors.foreground }]}>
            {show.name}
          </Text>
          {isManager ? (
            <View style={styles.titleActions}>
              <Pressable
                onPress={openEdit}
                hitSlop={8}
                testID="edit-show"
                accessibilityLabel="Edit show"
              >
                <Feather name="edit-2" size={20} color={colors.mutedForeground} />
              </Pressable>
              <Pressable
                onPress={confirmDelete}
                hitSlop={8}
                disabled={deleteShow.isPending}
                testID="delete-show"
                accessibilityLabel="Delete show"
              >
                <Feather
                  name="trash-2"
                  size={20}
                  color={colors.destructive ?? "#b91c1c"}
                />
              </Pressable>
            </View>
          ) : null}
        </View>
        <Text style={[styles.sub, { color: colors.mutedForeground }]}>
          {show.location ? `${show.location} · ` : ""}
          {formatIsoDate(show.showDate)}
        </Text>
        {show.notes ? (
          <Text style={[styles.notes, { color: colors.mutedForeground }]}>
            {show.notes}
          </Text>
        ) : null}

        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
          Results
        </Text>
        <Text style={[styles.sectionSub, { color: colors.mutedForeground }]}>
          One row per judge and class — a goat can appear multiple times.
        </Text>

        {show.results.length === 0 && drafts.length === 0 ? (
          <Card style={styles.emptyCard}>
            <EmptyState
              icon="award"
              title="No results yet"
              subtitle={
                isManager
                  ? "Add a goat's result below."
                  : "Results recorded by a manager will appear here."
              }
            />
          </Card>
        ) : (
          <View style={styles.list}>
            {show.results.map((r) => (
              <ResultCard key={r.id} result={r} />
            ))}
          </View>
        )}

        {isManager && drafts.length > 0 ? (
          <View style={[styles.list, styles.draftList]}>
            {drafts.map((d) => (
              <Card
                key={d.key}
                style={[
                  styles.draftCard,
                  { borderColor: colors.primary, backgroundColor: colors.muted },
                ]}
              >
                <View style={styles.draftHeader}>
                  <Text style={[styles.goatName, { color: colors.foreground }]}>
                    {d.goatName}
                  </Text>
                  <Pressable onPress={() => removeDraft(d.key)} hitSlop={8}>
                    <Feather name="trash-2" size={18} color={colors.mutedForeground} />
                  </Pressable>
                </View>

                <DraftInput
                  label="Judge"
                  value={d.judgeName}
                  onChange={(v) => updateDraft(d.key, { judgeName: v })}
                  placeholder="Judge name"
                />
                <DraftInput
                  label="Class / Division"
                  value={d.classDivision}
                  onChange={(v) => updateDraft(d.key, { classDivision: v })}
                  placeholder="e.g. Senior Doe"
                />

                <Text style={[styles.fieldMini, { color: colors.mutedForeground }]}>
                  Placement
                </Text>
                <View style={styles.pillRow}>
                  {PLACEMENTS.map((p) => {
                    const active = d.placement === p;
                    return (
                      <Pressable
                        key={p}
                        onPress={() =>
                          updateDraft(d.key, { placement: active ? "" : p })
                        }
                        style={[
                          styles.pill,
                          {
                            backgroundColor: active ? colors.primary : colors.background,
                            borderColor: active ? colors.primary : colors.border,
                          },
                        ]}
                      >
                        <Text
                          style={{
                            color: active ? colors.primaryForeground : colors.foreground,
                            fontFamily: "Inter_500Medium",
                            fontSize: 13,
                          }}
                        >
                          {p}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <DraftInput
                  label="Award / Ribbon"
                  value={d.awardRibbon}
                  onChange={(v) => updateDraft(d.key, { awardRibbon: v })}
                  placeholder="e.g. Blue ribbon"
                />
                <DraftInput
                  label="Notes (optional)"
                  value={d.notes}
                  onChange={(v) => updateDraft(d.key, { notes: v })}
                  placeholder="Notes"
                />
              </Card>
            ))}
          </View>
        ) : null}
      </ScrollView>

      {isManager ? (
        <View
          style={[
            styles.footer,
            {
              paddingBottom: insets.bottom + 12,
              backgroundColor: colors.background,
              borderTopColor: colors.border,
            },
          ]}
        >
          <Button
            label="Add Goat"
            icon="plus"
            variant="outline"
            onPress={() => setPickerOpen(true)}
            disabled={createResults.isPending}
            testID="add-goat-result"
          />
          {drafts.length > 0 ? (
            <Button
              label={`Save ${drafts.length} Result${drafts.length === 1 ? "" : "s"}`}
              icon="check"
              onPress={saveDrafts}
              loading={createResults.isPending}
              testID="save-results"
            />
          ) : null}
        </View>
      ) : null}

      <GoatPickerModal
        visible={pickerOpen}
        goats={sortedGoats}
        onPick={addDraft}
        onClose={() => setPickerOpen(false)}
      />

      <Modal
        visible={editOpen}
        animationType="slide"
        onRequestClose={() => setEditOpen(false)}
      >
        <View
          style={[
            styles.modalRoot,
            { backgroundColor: colors.background, paddingTop: insets.top + 12 },
          ]}
        >
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              Edit show
            </Text>
            <Pressable onPress={() => setEditOpen(false)} hitSlop={8}>
              <Feather name="x" size={24} color={colors.mutedForeground} />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
            keyboardShouldPersistTaps="handled"
          >
            <EditField
              label="Show name"
              value={editName}
              onChange={setEditName}
              placeholder="e.g. County Fair Dairy Goat Show"
              testID="edit-show-name"
            />
            <EditField
              label="Location (optional)"
              value={editLocation}
              onChange={setEditLocation}
              placeholder="e.g. Fairgrounds, Springfield"
            />
            <View style={styles.editField}>
              <DateField
                label="Date of show"
                value={editDate}
                onChange={setEditDate}
                testID="edit-show-date"
              />
            </View>
            <EditField
              label="Notes (optional)"
              value={editNotes}
              onChange={setEditNotes}
              placeholder="Anything worth remembering about this show"
              multiline
            />

            <Button
              label="Save Changes"
              icon="check"
              onPress={saveEdit}
              disabled={!canSaveEdit}
              loading={updateShow.isPending}
              fullWidth
              testID="save-show-edits"
            />
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

/** Convert a stored ISO datetime back to a local `YYYY-MM-DD` input value. */
function isoToDateInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function EditField({
  label,
  value,
  onChange,
  placeholder,
  multiline,
  autoCapitalize,
  keyboardType,
  error,
  testID,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  autoCapitalize?: "none" | "sentences";
  keyboardType?: "default" | "numbers-and-punctuation";
  error?: string;
  testID?: string;
}) {
  const colors = useColors();
  return (
    <View style={styles.editField}>
      <Text style={[styles.fieldMini, { color: colors.mutedForeground }]}>
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        multiline={multiline}
        autoCapitalize={autoCapitalize}
        keyboardType={keyboardType}
        testID={testID}
        style={[
          styles.input,
          multiline ? styles.multilineInput : null,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            color: colors.foreground,
            borderRadius: colors.radius,
          },
        ]}
      />
      {error ? (
        <Text style={[styles.fieldError, { color: colors.destructive ?? "#b91c1c" }]}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

function ResultCard({ result }: { result: ShowResultWithGoat }) {
  const colors = useColors();
  const router = useRouter();
  const meta = [
    result.classDivision,
    result.judgeName ? `Judge: ${result.judgeName}` : null,
    result.awardRibbon ? `Award: ${result.awardRibbon}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <Pressable onPress={() => router.push(`/goat/${result.goatId}`)}>
      {({ pressed }) => (
        <Card style={[styles.resultCard, pressed ? { opacity: 0.85 } : null]}>
          <View style={styles.resultHeader}>
            <Text style={[styles.goatName, { color: colors.foreground }]}>
              {result.goatName}
            </Text>
            {result.placement ? (
              <Badge label={result.placement} tone="primary" />
            ) : null}
          </View>
          {meta ? (
            <Text style={[styles.resultMeta, { color: colors.mutedForeground }]}>
              {meta}
            </Text>
          ) : null}
          {result.notes ? (
            <Text style={[styles.resultNotes, { color: colors.mutedForeground }]}>
              {result.notes}
            </Text>
          ) : null}
        </Card>
      )}
    </Pressable>
  );
}

function DraftInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const colors = useColors();
  return (
    <View style={styles.draftField}>
      <Text style={[styles.fieldMini, { color: colors.mutedForeground }]}>
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        style={[
          styles.input,
          {
            backgroundColor: colors.background,
            borderColor: colors.border,
            color: colors.foreground,
            borderRadius: colors.radius,
          },
        ]}
      />
    </View>
  );
}

function GoatPickerModal({
  visible,
  goats,
  onPick,
  onClose,
}: {
  visible: boolean;
  goats: Goat[];
  onPick: (goat: Goat) => void;
  onClose: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return goats;
    return goats.filter((g) => g.name.toLowerCase().includes(q));
  }, [goats, search]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View
        style={[
          styles.modalRoot,
          { backgroundColor: colors.background, paddingTop: insets.top + 12 },
        ]}
      >
        <View style={styles.modalHeader}>
          <Text style={[styles.modalTitle, { color: colors.foreground }]}>
            Pick a goat
          </Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <Feather name="x" size={24} color={colors.mutedForeground} />
          </Pressable>
        </View>

        <View
          style={[
            styles.searchRow,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              borderRadius: colors.radius,
            },
          ]}
        >
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

        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + 24, gap: 8 }}
          keyboardShouldPersistTaps="handled"
        >
          {filtered.length === 0 ? (
            <EmptyState
              icon="search"
              title={goats.length === 0 ? "No on-farm goats" : "No matches"}
              subtitle={
                goats.length === 0
                  ? "There are no on-farm goats to add."
                  : "Try a different search."
              }
            />
          ) : (
            filtered.map((goat) => (
              <Pressable key={goat.id} onPress={() => onPick(goat)}>
                {({ pressed }) => (
                  <Card style={pressed ? { opacity: 0.85 } : undefined}>
                    <Text style={[styles.goatName, { color: colors.foreground }]}>
                      {goat.name}
                    </Text>
                  </Card>
                )}
              </Pressable>
            ))
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { padding: 16 },
  h1: { fontFamily: "Inter_700Bold", fontSize: 24 },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  titleText: { flex: 1 },
  titleActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingTop: 4,
  },
  editField: { gap: 4, marginBottom: 14 },
  multilineInput: { minHeight: 80, textAlignVertical: "top" },
  fieldError: { fontFamily: "Inter_400Regular", fontSize: 12 },
  sub: { fontFamily: "Inter_400Regular", fontSize: 14, marginTop: 2 },
  notes: { fontFamily: "Inter_400Regular", fontSize: 14, marginTop: 6 },
  sectionTitle: { fontFamily: "Inter_600SemiBold", fontSize: 18, marginTop: 20 },
  sectionSub: { fontFamily: "Inter_400Regular", fontSize: 13, marginTop: 2, marginBottom: 12 },
  emptyCard: { marginTop: 4 },
  list: { gap: 10 },
  draftList: { marginTop: 12 },
  resultCard: { gap: 4 },
  resultHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  resultMeta: { fontFamily: "Inter_400Regular", fontSize: 13 },
  resultNotes: { fontFamily: "Inter_400Regular", fontSize: 13, fontStyle: "italic" },
  goatName: { fontFamily: "Inter_600SemiBold", fontSize: 16 },
  draftCard: { gap: 8 },
  draftHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  draftField: { gap: 4 },
  fieldMini: { fontFamily: "Inter_500Medium", fontSize: 12 },
  input: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: "Inter_400Regular",
    fontSize: 15,
  },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  pill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  modalRoot: { flex: 1, paddingHorizontal: 16 },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  modalTitle: { fontFamily: "Inter_700Bold", fontSize: 20 },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontFamily: "Inter_400Regular",
    fontSize: 15,
  },
});
