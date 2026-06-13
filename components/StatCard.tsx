import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, RADIUS, SPACING } from "../lib/theme";

type IoniconName = keyof typeof Ionicons.glyphMap;

interface Props {
  value: number | string;
  label: string;
  icon: IoniconName;
  color?: string;
}

// Card thống kê nhỏ ở Home: số lớn + nhãn + icon màu.
export default function StatCard({ value, label, icon, color = COLORS.primary }: Props) {
  return (
    <View style={styles.card}>
      <View style={[styles.iconWrap, { backgroundColor: color + "22" }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
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
    color: COLORS.text,
    fontSize: 24,
    fontWeight: "bold",
  },
  label: {
    color: COLORS.subText,
    fontSize: 13,
    marginTop: 2,
  },
});
