import {
  getGetGoatAccoladesQueryKey,
  getGetGoatQueryKey,
  useGetGoat,
  useGetGoatAccolades,
} from "@workspace/api-client-react";
import type { GoatAccolade } from "@workspace/api-client-react/src/generated/api.schemas";
import { useLocalSearchParams } from "expo-router";
import React from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Badge, Card, LoadingState } from "@/components/ui";
import { breedLabel, formatIsoDate, sexLabel } from "@/constants/domain";
import { useColors } from "@/hooks/useColors";

export default function GoatDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const { id } = useLocalSearchParams<{ id: string }>();
  const goatId = Number(id);

  const {
    data: goat,
    isLoading,
    isRefetching,
    refetch,
  } = useGetGoat(goatId, {
    query: { queryKey: getGetGoatQueryKey(goatId), enabled: Number.isFinite(goatId) },
  });
  const { data: accolades, refetch: refetchAccolades } = useGetGoatAccolades(
    goatId,
    {
      query: {
        queryKey: getGetGoatAccoladesQueryKey(goatId),
        enabled: Number.isFinite(goatId),
      },
    },
  );

  if (isLoading || !goat) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <LoadingState label="Loading goat…" />
      </View>
    );
  }

  const meta = [breedLabel(goat.breed), sexLabel(goat.sex)]
    .filter(Boolean)
    .join(" · ");
  const facts: { label: string; value: string }[] = [
    goat.dateOfBirth
      ? {
          label: "Born",
          value:
            typeof goat.age === "number"
              ? `${formatIsoDate(goat.dateOfBirth)} (${goat.age} yr${goat.age === 1 ? "" : "s"})`
              : formatIsoDate(goat.dateOfBirth),
        }
      : null,
    { label: "Status", value: goat.status },
    goat.lactationStatus
      ? { label: "Lactation", value: goat.lactationStatus }
      : null,
  ].filter((f): f is { label: string; value: string } => f !== null);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + 24 },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => {
              refetch();
              refetchAccolades();
            }}
            tintColor={colors.primary}
          />
        }
      >
        <Text style={[styles.h1, { color: colors.foreground }]}>
          {goat.name}
        </Text>
        {meta ? (
          <Text style={[styles.sub, { color: colors.mutedForeground }]}>
            {meta}
          </Text>
        ) : null}

        <Card style={styles.factsCard}>
          {facts.map((f) => (
            <View key={f.label} style={styles.factRow}>
              <Text style={[styles.factLabel, { color: colors.mutedForeground }]}>
                {f.label}
              </Text>
              <Text style={[styles.factValue, { color: colors.foreground }]}>
                {f.value}
              </Text>
            </View>
          ))}
          {goat.description ? (
            <Text style={[styles.description, { color: colors.mutedForeground }]}>
              {goat.description}
            </Text>
          ) : null}
        </Card>

        {accolades && accolades.length > 0 ? (
          <>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              Accolades
            </Text>
            <Text style={[styles.sectionSub, { color: colors.mutedForeground }]}>
              Show results, newest show first
            </Text>
            <View style={styles.list}>
              {accolades.map((a) => (
                <AccoladeCard key={a.show.id} accolade={a} />
              ))}
            </View>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

function AccoladeCard({ accolade }: { accolade: GoatAccolade }) {
  const colors = useColors();
  const { show, results } = accolade;
  return (
    <Card style={styles.accoladeCard}>
      <Text style={[styles.showName, { color: colors.foreground }]}>
        {show.name}
      </Text>
      <Text style={[styles.showMeta, { color: colors.mutedForeground }]}>
        {show.location ? `${show.location} · ` : ""}
        {formatIsoDate(show.showDate)}
      </Text>
      <View style={styles.resultList}>
        {results.map((r) => {
          const meta = [
            r.classDivision,
            r.judgeName ? `Judge: ${r.judgeName}` : null,
            r.awardRibbon ? `Award: ${r.awardRibbon}` : null,
          ]
            .filter(Boolean)
            .join(" · ");
          return (
            <View
              key={r.id}
              style={[styles.resultRow, { borderTopColor: colors.border }]}
            >
              <View style={styles.resultTop}>
                {r.placement ? (
                  <Badge label={r.placement} tone="primary" />
                ) : (
                  <Badge label="Entered" tone="muted" />
                )}
              </View>
              {meta ? (
                <Text style={[styles.resultMeta, { color: colors.mutedForeground }]}>
                  {meta}
                </Text>
              ) : null}
              {r.notes ? (
                <Text style={[styles.resultNotes, { color: colors.mutedForeground }]}>
                  {r.notes}
                </Text>
              ) : null}
            </View>
          );
        })}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { padding: 16 },
  h1: { fontFamily: "Inter_700Bold", fontSize: 24 },
  sub: { fontFamily: "Inter_400Regular", fontSize: 14, marginTop: 2 },
  factsCard: { marginTop: 16, gap: 8 },
  factRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  factLabel: { fontFamily: "Inter_500Medium", fontSize: 13 },
  factValue: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    textTransform: "capitalize",
  },
  description: { fontFamily: "Inter_400Regular", fontSize: 14, marginTop: 4 },
  sectionTitle: { fontFamily: "Inter_600SemiBold", fontSize: 18, marginTop: 20 },
  sectionSub: { fontFamily: "Inter_400Regular", fontSize: 13, marginTop: 2, marginBottom: 12 },
  list: { gap: 10 },
  accoladeCard: { gap: 2 },
  showName: { fontFamily: "Inter_600SemiBold", fontSize: 16 },
  showMeta: { fontFamily: "Inter_400Regular", fontSize: 13 },
  resultList: { marginTop: 8 },
  resultRow: { borderTopWidth: 1, paddingVertical: 8, gap: 4 },
  resultTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  resultMeta: { fontFamily: "Inter_400Regular", fontSize: 13 },
  resultNotes: { fontFamily: "Inter_400Regular", fontSize: 13, fontStyle: "italic" },
});
