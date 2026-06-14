import React, { useMemo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { type AppColors } from "../lib/theme";
import { useTheme } from "../contexts/ThemeContext";

export interface TabItem {
  key: string;
  label: string;
}

interface Props {
  tabs: TabItem[];
  active: string;
  onChange: (key: string) => void;
}

export default function FilterTabs({ tabs, active, onChange }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.row}>
      {tabs.map((t) => {
        const isActive = t.key === active;
        return (
          <TouchableOpacity
            key={t.key}
            style={[styles.tab, isActive && styles.tabActive]}
            onPress={() => onChange(t.key)}
            activeOpacity={0.8}
          >
            <Text style={[styles.text, isActive && styles.textActive]}>{t.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function createStyles(C: AppColors) {
  return StyleSheet.create({
    row: {
      flexDirection: "row",
      gap: 10,
      marginBottom: 22,
    },
    tab: {
      paddingHorizontal: 16,
      paddingVertical: 9,
      borderRadius: 999,
      backgroundColor: C.card,
      borderWidth: 1,
      borderColor: C.border,
    },
    tabActive: {
      backgroundColor: C.primary,
      borderColor: C.primary,
    },
    text: {
      color: C.subText,
      fontSize: 13,
      fontWeight: "600",
    },
    textActive: {
      color: "white",
    },
  });
}
