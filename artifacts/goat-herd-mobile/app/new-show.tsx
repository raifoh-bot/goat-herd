import { useQueryClient } from "@tanstack/react-query";
import {
  getListShowsQueryKey,
  useCreateShow,
} from "@workspace/api-client-react";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui";
import { dateInputToIso, todayInputValue } from "@/constants/domain";
import { useColors } from "@/hooks/useColors";

export default function NewShowScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [showDate, setShowDate] = useState(todayInputValue());
  const [notes, setNotes] = useState("");

  const createShow = useCreateShow();

  const dateValid = /^\d{4}-\d{2}-\d{2}$/.test(showDate.trim());
  const canSave = name.trim().length > 0 && dateValid;

  const save = () => {
    createShow.mutate(
      {
        data: {
          name: name.trim(),
          location: location.trim() || undefined,
          showDate: dateInputToIso(showDate.trim()),
          notes: notes.trim() || undefined,
        },
      },
      {
        onSuccess: (created) => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          queryClient.invalidateQueries({ queryKey: getListShowsQueryKey() });
          router.replace(`/show/${created.id}`);
        },
        onError: () =>
          Alert.alert(
            "Could not save",
            "The show could not be saved. Please try again.",
          ),
      },
    );
  };

  const inputStyle = [
    styles.input,
    {
      backgroundColor: colors.card,
      borderColor: colors.border,
      color: colors.foreground,
      borderRadius: colors.radius,
    },
  ];

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + 100 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.h1, { color: colors.foreground }]}>
          New Show
        </Text>
        <Text style={[styles.sub, { color: colors.mutedForeground }]}>
          Save the show first, then add each goat's results.
        </Text>

        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>
            Show name
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. County Fair Dairy Goat Show"
            placeholderTextColor={colors.mutedForeground}
            style={inputStyle}
            testID="show-name"
          />
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>
            Location (optional)
          </Text>
          <TextInput
            value={location}
            onChangeText={setLocation}
            placeholder="e.g. Fairgrounds, Springfield"
            placeholderTextColor={colors.mutedForeground}
            style={inputStyle}
          />
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>
            Date of show (YYYY-MM-DD)
          </Text>
          <TextInput
            value={showDate}
            onChangeText={setShowDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.mutedForeground}
            style={inputStyle}
            autoCapitalize="none"
            keyboardType="numbers-and-punctuation"
          />
          {!dateValid && showDate.trim().length > 0 ? (
            <Text style={[styles.fieldError, { color: colors.destructive ?? "#b91c1c" }]}>
              Use the YYYY-MM-DD format, e.g. {todayInputValue()}
            </Text>
          ) : null}
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>
            Notes (optional)
          </Text>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Anything worth remembering about this show"
            placeholderTextColor={colors.mutedForeground}
            style={[...inputStyle, styles.notesInput]}
            multiline
          />
        </View>
      </ScrollView>

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
          label="Save Show"
          icon="check"
          onPress={save}
          disabled={!canSave}
          loading={createShow.isPending}
          fullWidth
          testID="save-show"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { padding: 16, gap: 4 },
  h1: { fontFamily: "Inter_700Bold", fontSize: 24 },
  sub: { fontFamily: "Inter_400Regular", fontSize: 14, marginBottom: 16 },
  field: { marginBottom: 14 },
  label: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: "Inter_400Regular",
    fontSize: 16,
  },
  notesInput: { minHeight: 80, textAlignVertical: "top" },
  fieldError: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 4 },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
  },
});
