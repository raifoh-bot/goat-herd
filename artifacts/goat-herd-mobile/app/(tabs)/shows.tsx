import {
  getListShowsQueryKey,
  useListShows,
} from "@workspace/api-client-react";
import type { Show } from "@workspace/api-client-react/src/generated/api.schemas";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button, Card, EmptyState, LoadingState } from "@/components/ui";
import { formatIsoDate } from "@/constants/domain";
import { useIsManager } from "@/context/auth";
import { useColors } from "@/hooks/useColors";

export default function ShowsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const isManager = useIsManager();

  const { data: shows, isLoading, isRefetching, refetch } = useListShows({
    query: { queryKey: getListShowsQueryKey() },
  });

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
        <Text style={[styles.h1, { color: colors.foreground }]}>Shows</Text>
        <Text style={[styles.sub, { color: colors.mutedForeground }]}>
          Show results across your herd
        </Text>

        {isLoading ? (
          <LoadingState label="Loading shows…" />
        ) : !shows || shows.length === 0 ? (
          <Card style={styles.emptyCard}>
            <EmptyState
              icon="award"
              title="No shows recorded yet"
              subtitle={
                isManager
                  ? "Use “New Show” to record your first show's results."
                  : "Show results recorded by a manager will appear here."
              }
            />
          </Card>
        ) : (
          <View style={styles.list}>
            {shows.map((show) => (
              <ShowCard key={show.id} show={show} />
            ))}
          </View>
        )}
      </ScrollView>

      {isManager ? (
        <View
          style={[
            styles.fabWrap,
            {
              paddingBottom: insets.bottom + 12,
              backgroundColor: colors.background,
              borderTopColor: colors.border,
            },
          ]}
        >
          <Button
            label="New Show"
            icon="plus"
            onPress={() => router.push("/new-show")}
            fullWidth
            testID="new-show"
          />
        </View>
      ) : null}
    </View>
  );
}

function ShowCard({ show }: { show: Show }) {
  const colors = useColors();
  const router = useRouter();
  return (
    <Pressable onPress={() => router.push(`/show/${show.id}`)}>
      {({ pressed }) => (
        <Card style={[styles.showCard, pressed ? { opacity: 0.85 } : null]}>
          <View
            style={[styles.showIcon, { backgroundColor: colors.muted }]}
          >
            <Feather name="award" size={20} color={colors.primary} />
          </View>
          <View style={styles.flex}>
            <Text style={[styles.showName, { color: colors.foreground }]}>
              {show.name}
            </Text>
            <Text style={[styles.showMeta, { color: colors.mutedForeground }]}>
              {show.location ? `${show.location} · ` : ""}
              {formatIsoDate(show.showDate)}
            </Text>
          </View>
          <Feather
            name="chevron-right"
            size={20}
            color={colors.mutedForeground}
          />
        </Card>
      )}
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
  list: { gap: 12 },
  showCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  showIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  showName: { fontFamily: "Inter_600SemiBold", fontSize: 16 },
  showMeta: { fontFamily: "Inter_400Regular", fontSize: 13, marginTop: 2 },
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
