import React, { useMemo } from "react";
import { StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { type AppColors } from "../lib/theme";
import { useTheme } from "../contexts/ThemeContext";

type IoniconName = keyof typeof Ionicons.glyphMap;

interface Props {
  icon: IoniconName;
  label: string;
  iconColor?: string;
  value?: boolean;
  onValueChange?: (v: boolean) => void;
  onPress?: () => void;
  rightText?: string;
  danger?: boolean;
  last?: boolean;
}

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
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isToggle = onValueChange !== undefined;
  const tint = danger ? colors.danger : iconColor ?? colors.primary;

  const content = (
    <View style={[styles.row, !last && styles.divider]}>
      <View style={[styles.iconWrap, { backgroundColor: tint + "22" }]}>
        <Ionicons name={icon} size={18} color={tint} />
      </View>

      <Text style={[styles.label, danger && { color: colors.danger }]}>{label}</Text>

      {isToggle ? (
        <Switch
          value={value}
          onValueChange={onValueChange}
          thumbColor={value ? colors.primary : "#999"}
          trackColor={{ true: colors.primary + "66", false: colors.border }}
        />
      ) : rightText ? (
        <Text style={styles.rightText}>{rightText}</Text>
      ) : (
        <Ionicons name="chevron-forward" size={20} color={colors.muted} />
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

function createStyles(C: AppColors) {
  return StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 12,
    },
    divider: {
      borderBottomWidth: 1,
      borderBottomColor: C.border,
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
      color: C.text,
      fontSize: 15,
      fontWeight: "500",
    },
    rightText: {
      color: C.subText,
      fontSize: 14,
    },
  });
}
