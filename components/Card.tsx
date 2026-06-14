import React, { useMemo } from "react";
import { StyleSheet, View, ViewProps, ViewStyle } from "react-native";
import { RADIUS, SPACING, type AppColors } from "../lib/theme";
import { useTheme } from "../contexts/ThemeContext";

interface Props extends ViewProps {
  bordered?: boolean;
  style?: ViewStyle | ViewStyle[];
}

export default function Card({ bordered, style, children, ...rest }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={[styles.card, bordered && styles.bordered, style]} {...rest}>
      {children}
    </View>
  );
}

function createStyles(C: AppColors) {
  return StyleSheet.create({
    card: {
      backgroundColor: C.card,
      borderRadius: RADIUS.lg,
      padding: SPACING.lg,
    },
    bordered: {
      borderWidth: 1,
      borderColor: C.border,
    },
  });
}
