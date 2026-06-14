import { Tabs } from "expo-router";

import { Ionicons } from "@expo/vector-icons";

import { useTheme } from "../../contexts/ThemeContext";

export default function TabLayout() {
  const { colors, isDark } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,

        tabBarStyle: {
          backgroundColor: colors.card,

          borderTopWidth: isDark ? 0 : 1,
          borderTopColor: colors.border,

          height: 72,

          paddingTop: 8,

          paddingBottom: 8,
        },

        tabBarActiveTintColor: colors.primary,

        tabBarInactiveTintColor: colors.subText,

        tabBarLabelStyle: {
          fontSize: 11,
        },
      }}
    >
      {/* HOME */}
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",

          tabBarIcon: ({ color, size }) => (
            <Ionicons
              name="home"
              size={size}
              color={color}
            />
          ),
        }}
      />

      {/* RULES */}
      <Tabs.Screen
        name="rules"
        options={{
          title: "Rules",

          tabBarIcon: ({ color, size }) => (
            <Ionicons
              name="list"
              size={size}
              color={color}
            />
          ),
        }}
      />

      {/* ALERTS */}
      <Tabs.Screen
        name="notifications"
        options={{
          title: "Alerts",

          tabBarIcon: ({ color, size }) => (
            <Ionicons
              name="notifications"
              size={size}
              color={color}
            />
          ),
        }}
      />

      {/* SETTINGS */}
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",

          tabBarIcon: ({ color, size }) => (
            <Ionicons
              name="settings"
              size={size}
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}