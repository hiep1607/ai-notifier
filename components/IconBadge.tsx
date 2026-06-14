import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { RADIUS } from "../lib/theme";
import { findCategory } from "../lib/ruleOptions";

type IoniconName = keyof typeof Ionicons.glyphMap;

interface Props {
  category?: string;
  icon?: IoniconName;
  color?: string;
  size?: number;
  filled?: boolean;
  unreadCount?: number;
}

export default function IconBadge({
  category,
  icon,
  color,
  size = 50,
  filled = true,
  unreadCount = 0,
}: Props) {
  const cat = findCategory(category);
  const iconName = icon ?? cat.icon;
  const tint = color ?? cat.color;
  const iconSize = Math.round(size * 0.44);

  return (
    <View style={{ width: size, height: size }}>
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
      {unreadCount > 0 && (
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{unreadCount > 99 ? "99+" : unreadCount}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    justifyContent: "center",
    alignItems: "center",
    borderRadius: RADIUS.md,
  },
  countBadge: {
    position: "absolute",
    top: -5,
    right: -5,
    backgroundColor: "#EF4444",
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 3,
    borderWidth: 2,
    borderColor: "white",
  },
  countText: {
    color: "white",
    fontSize: 10,
    fontWeight: "700",
    lineHeight: 13,
  },
});
