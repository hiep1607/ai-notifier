import React, { useMemo } from "react";
import { StyleSheet, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { RADIUS, type AppColors } from "../lib/theme";
import { useTheme } from "../contexts/ThemeContext";

type IoniconName = keyof typeof Ionicons.glyphMap;

interface Props {
  label: string;
  icon?: IoniconName;
  onPress: () => void;
}

export default function SuggestionChip({ label, icon = "sparkles-outline", onPress }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <TouchableOpacity style={styles.chip} onPress={onPress} activeOpacity={0.8}>
      <Ionicons name={icon} size={16} color={colors.primary} />
      <Text style={styles.text}>{label}</Text>
    </TouchableOpacity>
  );
}

function createStyles(C: AppColors) {
  return StyleSheet.create({
    chip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      backgroundColor: C.cardAlt,
      borderWidth: 1,
      borderColor: C.border,
      borderRadius: RADIUS.md,
      paddingHorizontal: 16,
      paddingVertical: 14,
      marginBottom: 12,
    },
    text: {
      color: C.text,
      fontSize: 14,
      fontWeight: "500",
      flex: 1,
    },
  });
}
