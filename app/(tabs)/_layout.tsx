/*
  File: _layout.tsx

  Chức năng:
  - Điều hướng Tab Navigation
  - Quản lý tab chính
*/

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

  {/* EXPLORE */}
  <Tabs.Screen
    name="explore"
    options={{
      title: "Explore",

      tabBarIcon: ({ color, size }) => (
        <Ionicons
          name="compass"
          size={size}
          color={color}
        />
      ),
    }}
  />

  {/* NOTIFICATIONS */}
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