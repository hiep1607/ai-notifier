import React from "react";
import { StyleSheet, View, ViewProps, ViewStyle } from "react-native";
import { COLORS, RADIUS, SPACING } from "../lib/theme";

interface Props extends ViewProps {
  bordered?: boolean;
  style?: ViewStyle | ViewStyle[];
}

// Khối card nền tối bo tròn — dùng khắp app.
export default function Card({ bordered, style, children, ...rest }: Props) {
  return (
    <View
      style={[styles.card, bordered && styles.bordered, style]}
      {...rest}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
  },
  bordered: {
    borderWidth: 1,
    borderColor: COLORS.border,
  },
});
