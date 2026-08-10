import { Feather } from "@expo/vector-icons";
import {
  getGetHealthWorkDueQueryKey,
  useGetHealthWorkDue,
} from "@workspace/api-client-react";
import type {
  DueHealthItem,
  GoatDueHealth,
} from "@workspace/api-client-react/src/generated/api.schemas";
import { useRouter } from "expo-router";
import React, { useMemo } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Badge, Button, Card, EmptyState, LoadingState } from "@/components/ui";
import {
  breedLabel,
  dueItemLabel,
  isActionable,
  isWorkDayActionable,
  sexLabel,
} from "@/constants/domain";
import { useColors } from "@/hooks/useColors";

export default function DueScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { data, isLoading, isRefetching, refetch } = useGetHealthWorkDue({
    query: { queryKey: getGetHealthWorkDueQueryKey(), staleTime: 30_000 },
  });

  // Only goats that have at least one due/overdue/never task, most-urgent first.
  const dueGoats = useMemo(() => {
    const list = (data?.goats ?? []).filter((g) => g.items.length > 0);
    const rank = (g: GoatDueHealth) =>
      g.items.some((i) => i.status === "overdue" || i.status === "never")
        ? 0
        : 1;
    return [...list].sort((a, b) => rank(a) - rank(b));
  }, [data]);

  const actionableCount = useMemo(
    () =>
      (data?.goats ?? []).filter((g) => g.items.some(isWorkDayActionable)).length,
    [data],
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 100 },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={colors.primary}
          />
        }
      >
        <Text style={[styles.h1, { color: colors.foreground }]}>Today</Text>
        <Text style={[styles.sub, { color: colors.mutedForeground }]}>
          Health work coming due across your herd
        </Text>

        {isLoading ? (
          <LoadingState label="Checking the herd…" />
        ) : dueGoats.length === 0 ? (
          <Card style={styles.emptyCard}>
            <EmptyState
              icon="check-circle"
              title="All caught up"
              subtitle="No goats are due for routine health work right now."
            />
          </Card>
        ) : (
          <>
            <Card
              style={[
                styles.summary,
                { backgroundColor: colors.warningBg, borderColor: colors.warningBorder },
              ]}
            >
              <Feather name="calendar" size={22} color={colors.warning} />
              <View style={styles.flex}>
                <Text style={[styles.summaryTitle, { color: colors.warningForeground }]}>
                  {actionableCount} goat{actionableCount === 1 ? "" : "s"} due now
                </Text>
                <Text style={[styles.summaryBody, { color: colors.warningForeground }]}>
                  Start a Herd Work Day to record health events. Due goats and
                  tasks are pre-selected for you.
                </Text>
              </View>
            </Card>

            <View style={styles.list}>
              {dueGoats.map((entry) => (
                <GoatDueCard key={entry.goat.id} entry={entry} />
              ))}
            </View>
          </>
        )}
      </ScrollView>

      <View
        style={[
          styles.fabWrap,
          { paddingBottom: insets.bottom + 12, backgroundColor: colors.background, borderTopColor: colors.border },
        ]}
      >
        <Button
          label="Start Herd Work Day"
          icon="clipboard"
          onPress={() => router.push("/work-day")}
          fullWidth
          testID="start-work-day"
        />
      </View>
    </View>
  );
}

function GoatDueCard({ entry }: { entry: GoatDueHealth }) {
  const colors = useColors();
  const router = useRouter();
  const { goat, items } = entry;
  const meta = [breedLabel(goat.breed), sexLabel(goat.sex)]
    .filter(Boolean)
    .join(" · ");

  return (
    <Pressable onPress={() => router.push(`/goat/${goat.id}`)}>
    <Card style={styles.goatCard}>
      <Text style={[styles.goatName, { color: colors.foreground }]}>
        {goat.name}
      </Text>
      {meta ? (
        <Text style={[styles.goatMeta, { color: colors.mutedForeground }]}>
          {meta}
        </Text>
      ) : null}
      <View style={styles.badgeRow}>
        {items.map((item: DueHealthItem) => (
          <Badge
            key={item.eventType}
            label={dueItemLabel(item)}
            tone={isActionable(item) ? "warning" : "muted"}
          />
        ))}
      </View>
    </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  scroll: { paddingHorizontal: 16, gap: 4 },
  h1: { fontFamily: "Inter_700Bold", fontSize: 28 },
  sub: { fontFamily: "Inter_400Regular", fontSize: 15, marginBottom: 16 },
  emptyCard: { marginTop: 8 },
  summary: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
    marginBottom: 16,
  },
  summaryTitle: { fontFamily: "Inter_600SemiBold", fontSize: 16, marginBottom: 2 },
  summaryBody: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 18 },
  list: { gap: 12 },
  goatCard: { gap: 4 },
  goatName: { fontFamily: "Inter_600SemiBold", fontSize: 17 },
  goatMeta: { fontFamily: "Inter_400Regular", fontSize: 13 },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  fabWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
  },
});
