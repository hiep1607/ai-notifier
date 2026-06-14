import React, { useMemo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { RADIUS, SPACING, type AppColors } from "../lib/theme";
import { useTheme } from "../contexts/ThemeContext";

type IoniconName = keyof typeof Ionicons.glyphMap;

interface Props {
  value: number | string;
  label: string;
  icon: IoniconName;
  color?: string;
  onPress?: () => void;
}

export default function StatCard({ value, label, icon, color, onPress }: Props) {
  const { colors } = useTheme();
  const resolvedColor = color ?? colors.primary;
  const styles = useMemo(() => createStyles(colors), [colors]);

  const inner = (
    <View style={[styles.card, onPress && styles.cardPressable]}>
      <View style={[styles.iconWrap, { backgroundColor: resolvedColor + "22" }]}>
        <Ionicons name={icon} size={18} color={resolvedColor} />
      </View>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity style={{ flex: 1 }} activeOpacity={0.75} onPress={onPress}>
        {inner}
      </TouchableOpacity>
    );
  }

  return inner;
}

function createStyles(C: AppColors) {
  return StyleSheet.create({
    card: {
      flex: 1,
      backgroundColor: C.card,
      borderRadius: RADIUS.lg,
      padding: SPACING.md,
    },
    cardPressable: {
      borderWidth: 1,
      borderColor: C.border,
    },
    iconWrap: {
      width: 34,
      height: 34,
      borderRadius: 10,
      justifyContent: "center",
      alignItems: "center",
      marginBottom: 10,
    },
    value: {
      color: C.text,
      fontSize: 24,
      fontWeight: "bold",
    },
    label: {
      color: C.subText,
      fontSize: 13,
      marginTop: 2,
    },
  });
}
