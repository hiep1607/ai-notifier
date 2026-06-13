import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { COLORS } from "../lib/theme";

export interface TabItem {
  key: string;
  label: string;
}

interface Props {
  tabs: TabItem[];
  active: string;
  onChange: (key: string) => void;
}

// Hàng tab lọc kiểu pill (Tất cả / Đang hoạt động / Tạm dừng...).
export default function FilterTabs({ tabs, active, onChange }: Props) {
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

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 22,
  },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  tabActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  text: {
    color: COLORS.subText,
    fontSize: 13,
    fontWeight: "600",
  },
  textActive: {
    color: "white",
  },
});
