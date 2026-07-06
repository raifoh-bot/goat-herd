import { Feather } from "@expo/vector-icons";
import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import type { FeatherIconName } from "@/constants/domain";
import { useColors } from "@/hooks/useColors";

type ButtonVariant = "primary" | "secondary" | "outline" | "ghost";

export function Button({
  label,
  onPress,
  variant = "primary",
  icon,
  iconRight,
  loading = false,
  disabled = false,
  fullWidth = false,
  testID,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  icon?: FeatherIconName;
  iconRight?: FeatherIconName;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  testID?: string;
}) {
  const colors = useColors();
  const isDisabled = disabled || loading;

  const bg: Record<ButtonVariant, string> = {
    primary: colors.primary,
    secondary: colors.secondary,
    outline: "transparent",
    ghost: "transparent",
  };
  const fg: Record<ButtonVariant, string> = {
    primary: colors.primaryForeground,
    secondary: colors.secondaryForeground,
    outline: colors.primary,
    ghost: colors.mutedForeground,
  };

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.btn,
        {
          backgroundColor: bg[variant],
          borderColor: variant === "outline" ? colors.border : "transparent",
          borderWidth: variant === "outline" ? 1 : 0,
          borderRadius: colors.radius,
          opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1,
          alignSelf: fullWidth ? "stretch" : "flex-start",
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg[variant]} size="small" />
      ) : (
        <View style={styles.btnInner}>
          {icon ? <Feather name={icon} size={18} color={fg[variant]} /> : null}
          <Text
            style={[styles.btnLabel, { color: fg[variant] }]}
            numberOfLines={1}
          >
            {label}
          </Text>
          {iconRight ? (
            <Feather name={iconRight} size={18} color={fg[variant]} />
          ) : null}
        </View>
      )}
    </Pressable>
  );
}

export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useColors();
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderRadius: colors.radius,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Badge({
  label,
  tone = "muted",
}: {
  label: string;
  tone?: "muted" | "warning" | "primary";
}) {
  const colors = useColors();
  const map = {
    muted: { bg: colors.muted, fg: colors.mutedForeground },
    warning: { bg: colors.warningBg, fg: colors.warning },
    primary: { bg: colors.primary, fg: colors.primaryForeground },
  } as const;
  const c = map[tone];
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]}>
      <Text style={[styles.badgeText, { color: c.fg }]}>{label}</Text>
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  subtitle,
}: {
  icon: FeatherIconName;
  title: string;
  subtitle?: string;
}) {
  const colors = useColors();
  return (
    <View style={styles.empty}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.muted }]}>
        <Feather name={icon} size={28} color={colors.mutedForeground} />
      </View>
      <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
        {title}
      </Text>
      {subtitle ? (
        <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

export function LoadingState({ label }: { label?: string }) {
  const colors = useColors();
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.primary} />
      {label ? (
        <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
          {label}
        </Text>
      ) : null}
    </View>
  );
}

export function StepDots({ step, total }: { step: number; total: number }) {
  const colors = useColors();
  return (
    <View style={styles.dots}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            {
              backgroundColor:
                i <= step ? colors.primary : colors.border,
              width: i === step ? 24 : 8,
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  btn: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    minHeight: 50,
    justifyContent: "center",
  },
  btnInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  btnLabel: { fontFamily: "Inter_600SemiBold", fontSize: 16 },
  card: {
    borderWidth: 1,
    padding: 16,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    alignSelf: "flex-start",
  },
  badgeText: { fontFamily: "Inter_500Medium", fontSize: 12 },
  empty: { alignItems: "center", paddingVertical: 48, paddingHorizontal: 32, gap: 8 },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyTitle: { fontFamily: "Inter_600SemiBold", fontSize: 17, textAlign: "center" },
  emptySub: { fontFamily: "Inter_400Regular", fontSize: 14, textAlign: "center", lineHeight: 20 },
  loading: { alignItems: "center", justifyContent: "center", paddingVertical: 48, gap: 12 },
  loadingText: { fontFamily: "Inter_400Regular", fontSize: 14 },
  dots: { flexDirection: "row", gap: 6, alignItems: "center" },
  dot: { height: 8, borderRadius: 4 },
});
