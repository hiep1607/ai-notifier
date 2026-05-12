/*
  File: _layout.tsx

  Chức năng:
  - Điều hướng Tab Navigation
  - Quản lý các tab chính của app
*/

import { Tabs } from "expo-router";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,

        tabBarStyle: {
          backgroundColor: "#081B3C",

          borderTopWidth: 0,

          height: 70,
        },

        tabBarActiveTintColor: "#4DA6FF",

        tabBarInactiveTintColor: "#B8C7E0",
      }}
    >
      {/* Home Tab */}
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
        }}
      />

      {/* Explore Tab */}
      <Tabs.Screen
        name="explore"
        options={{
          title: "Explore",
        }}
      />
    </Tabs>
  );
}