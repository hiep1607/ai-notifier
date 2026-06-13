import React from "react";
import { StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "../lib/theme";

type IoniconName = keyof typeof Ionicons.glyphMap;

interface Props {
  icon: IoniconName;
  label: string;
  iconColor?: string;
  // Dạng toggle
  value?: boolean;
  onValueChange?: (v: boolean) => void;
  // Dạng link (chevron) hoặc giá trị bên phải
  onPress?: () => void;
  rightText?: string;
  danger?: boolean;
  last?: boolean; // bỏ đường kẻ dưới
}

// Một dòng trong Settings: icon + nhãn + (toggle | chevron | text).
export default function SettingRow({
  icon,
  label,
  iconColor,
  value,
  onValueChange,
  onPress,
  rightText,
  danger,
  last,
}: Props) {
  const isToggle = onValueChange !== undefined;
  const tint = danger ? COLORS.danger : iconColor ?? COLORS.primary;

  const content = (
    <View style={[styles.row, !last && styles.divider]}>
      <View style={[styles.iconWrap, { backgroundColor: tint + "22" }]}>
        <Ionicons name={icon} size={18} color={tint} />
      </View>

      <Text style={[styles.label, danger && { color: COLORS.danger }]}>{label}</Text>

      {isToggle ? (
        <Switch
          value={value}
          onValueChange={onValueChange}
          thumbColor={value ? COLORS.primary : "#555"}
          trackColor={{ true: COLORS.primary + "66", false: "#2A3A5C" }}
        />
      ) : rightText ? (
        <Text style={styles.rightText}>{rightText}</Text>
      ) : (
        <Ionicons name="chevron-forward" size={20} color={COLORS.muted} />
      )}
    </View>
  );

  if (isToggle) return content;

  return (
    <TouchableOpacity activeOpacity={0.7} onPress={onPress}>
      {content}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
  },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },
  label: {
    flex: 1,
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "500",
  },
  rightText: {
    color: COLORS.subText,
    fontSize: 14,
  },
});
