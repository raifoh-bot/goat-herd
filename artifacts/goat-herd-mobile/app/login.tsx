import { Feather } from "@expo/vector-icons";
import { ApiError } from "@workspace/api-client-react/src/custom-fetch";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button, Card } from "@/components/ui";
import { useAuth } from "@/context/auth";
import { useColors } from "@/hooks/useColors";

export default function LoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signIn, lastFarmSlug } = useAuth();

  const [farm, setFarm] = useState(lastFarmSlug ?? "");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit =
    farm.trim().length > 0 &&
    username.trim().length > 0 &&
    password.length > 0;

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await signIn(farm, username.trim(), password);
      router.replace("/(tabs)");
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 400)) {
        setError("Wrong farm, username, or password. Please try again.");
      } else {
        setError("Could not sign in. Check your connection and try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const inputStyle = [
    styles.input,
    {
      backgroundColor: colors.background,
      borderColor: colors.border,
      color: colors.foreground,
      borderRadius: colors.radius,
    },
  ];

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 24 },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.brand}>
            <Image
              source={require("@/assets/images/icon.png")}
              style={styles.logo}
              contentFit="cover"
            />
            <Text style={[styles.title, { color: colors.foreground }]}>
              MyGoatHerd
            </Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              Herd health, in your pocket
            </Text>
          </View>

          <Card style={styles.card}>
            <Field label="Farm" colors={colors}>
              <TextInput
                testID="farm-input"
                value={farm}
                onChangeText={setFarm}
                placeholder="your-farm-slug"
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="none"
                autoCorrect={false}
                style={inputStyle}
              />
            </Field>
            <Field label="Username" colors={colors}>
              <TextInput
                testID="username-input"
                value={username}
                onChangeText={setUsername}
                placeholder="username"
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="none"
                autoCorrect={false}
                style={inputStyle}
              />
            </Field>
            <Field label="Password" colors={colors}>
              <TextInput
                testID="password-input"
                value={password}
                onChangeText={setPassword}
                placeholder="password"
                placeholderTextColor={colors.mutedForeground}
                secureTextEntry
                autoCapitalize="none"
                onSubmitEditing={handleSubmit}
                returnKeyType="go"
                style={inputStyle}
              />
            </Field>

            {error ? (
              <View style={styles.errorRow}>
                <Feather name="alert-circle" size={16} color={colors.destructive} />
                <Text style={[styles.errorText, { color: colors.destructive }]}>
                  {error}
                </Text>
              </View>
            ) : null}

            <Button
              label="Sign in"
              onPress={handleSubmit}
              loading={submitting}
              disabled={!canSubmit}
              fullWidth
              iconRight="arrow-right"
              testID="signin-button"
            />
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function Field({
  label,
  colors,
  children,
}: {
  label: string;
  colors: ReturnType<typeof useColors>;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: colors.foreground }]}>
        {label}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 24 },
  brand: { alignItems: "center", marginBottom: 32, gap: 6 },
  logo: { width: 88, height: 88, borderRadius: 22, marginBottom: 10 },
  title: { fontFamily: "Inter_700Bold", fontSize: 30 },
  subtitle: { fontFamily: "Inter_400Regular", fontSize: 15 },
  card: { gap: 16, padding: 20 },
  field: { gap: 6 },
  fieldLabel: { fontFamily: "Inter_500Medium", fontSize: 14 },
  input: {
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: "Inter_400Regular",
    fontSize: 16,
    minHeight: 48,
  },
  errorRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  errorText: { fontFamily: "Inter_400Regular", fontSize: 14, flex: 1 },
});
