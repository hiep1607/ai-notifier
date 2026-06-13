import { Tabs } from "expo-router";

import { Ionicons } from "@expo/vector-icons";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,

        tabBarStyle: {
          backgroundColor: "#081B3C",

          borderTopWidth: 0,

          height: 72,

          paddingTop: 8,

          paddingBottom: 8,
        },

        tabBarActiveTintColor: "#4DA6FF",

        tabBarInactiveTintColor: "#B8C7E0",

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