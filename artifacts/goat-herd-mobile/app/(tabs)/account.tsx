import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button, Card } from "@/components/ui";
import { useAuth } from "@/context/auth";
import { useColors } from "@/hooks/useColors";

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  owner: "Owner",
  farmhand: "Farmhand",
  superadmin: "Super-admin",
};

export default function AccountScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = () => {
    Alert.alert("Sign out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: async () => {
          setSigningOut(true);
          try {
            await signOut();
          } finally {
            setSigningOut(false);
          }
        },
      },
    ]);
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 100 },
        ]}
      >
        <Text style={[styles.h1, { color: colors.foreground }]}>Account</Text>

        <Card style={styles.card}>
          <Row icon="user" label="Username" value={user?.username ?? "—"} colors={colors} />
          <Divider colors={colors} />
          <Row
            icon="award"
            label="Role"
            value={user ? (ROLE_LABELS[user.role] ?? user.role) : "—"}
            colors={colors}
          />
          <Divider colors={colors} />
          <Row
            icon="home"
            label="Farm"
            value={user?.farmSlug ?? "—"}
            colors={colors}
          />
        </Card>

        <Button
          label="Sign out"
          variant="outline"
          icon="log-out"
          onPress={handleSignOut}
          loading={signingOut}
          fullWidth
        />
      </ScrollView>
    </View>
  );
}

function Row({
  icon,
  label,
  value,
  colors,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value: string;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={styles.row}>
      <View style={[styles.rowIcon, { backgroundColor: colors.muted }]}>
        <Feather name={icon} size={18} color={colors.primary} />
      </View>
      <View style={styles.flex}>
        <Text style={[styles.rowLabel, { color: colors.mutedForeground }]}>{label}</Text>
        <Text style={[styles.rowValue, { color: colors.foreground }]}>{value}</Text>
      </View>
    </View>
  );
}

function Divider({ colors }: { colors: ReturnType<typeof useColors> }) {
  return <View style={[styles.divider, { backgroundColor: colors.border }]} />;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  scroll: { paddingHorizontal: 16, gap: 20 },
  h1: { fontFamily: "Inter_700Bold", fontSize: 28 },
  card: { gap: 0, padding: 0 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16 },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  rowLabel: { fontFamily: "Inter_400Regular", fontSize: 13 },
  rowValue: { fontFamily: "Inter_600SemiBold", fontSize: 16 },
  divider: { height: 1, marginHorizontal: 16 },
});
