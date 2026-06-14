import React from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { RADIUS } from "../lib/theme";
import { useTheme } from "../contexts/ThemeContext";

type IoniconName = keyof typeof Ionicons.glyphMap;

interface Props {
  label: string;
  onPress: () => void;
  icon?: IoniconName;
  loading?: boolean;
  disabled?: boolean;
  variant?: "primary" | "outline";
  color?: string;
  style?: ViewStyle | ViewStyle[];
}

export default function PrimaryButton({
  label,
  onPress,
  icon,
  loading,
  disabled,
  variant = "primary",
  color,
  style,
}: Props) {
  const { colors } = useTheme();
  const resolvedColor = color ?? colors.primary;
  const outline = variant === "outline";

  return (
    <TouchableOpacity
      style={[
        styles.btn,
        outline
          ? { backgroundColor: "transparent", borderWidth: 1, borderColor: resolvedColor }
          : { backgroundColor: resolvedColor },
        (disabled || loading) && { opacity: 0.6 },
        style,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.85}
    >
      {loading ? (
        <ActivityIndicator size="small" color={outline ? resolvedColor : "white"} />
      ) : (
        icon && <Ionicons name={icon} size={20} color={outline ? resolvedColor : "white"} />
      )}
      <Text style={[styles.text, { color: outline ? resolvedColor : "white" }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: RADIUS.md,
  },
  text: {
    fontWeight: "bold",
    fontSize: 16,
  },
});
