import React from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { RADIUS } from "../lib/theme";
import { findCategory } from "../lib/ruleOptions";

type IoniconName = keyof typeof Ionicons.glyphMap;

interface Props {
  // Cách 1: truyền category key → tự suy icon + màu
  category?: string;
  // Cách 2: tự chỉ định icon + màu
  icon?: IoniconName;
  color?: string;
  size?: number; // kích thước ô (mặc định 50)
  filled?: boolean; // true = nền đặc màu, false = nền mờ + icon màu
}

// Ô icon vuông bo tròn nhiều màu theo loại — dùng cho rule & notification.
export default function IconBadge({
  category,
  icon,
  color,
  size = 50,
  filled = true,
}: Props) {
  const cat = findCategory(category);
  const iconName = icon ?? cat.icon;
  const tint = color ?? cat.color;
  const iconSize = Math.round(size * 0.44);

  return (
    <View
      style={[
        styles.box,
        {
          width: size,
          height: size,
          borderRadius: size * 0.32,
          backgroundColor: filled ? tint : tint + "22",
        },
      ]}
    >
      <Ionicons name={iconName} size={iconSize} color={filled ? "white" : tint} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    justifyContent: "center",
    alignItems: "center",
    borderRadius: RADIUS.md,
  },
});
