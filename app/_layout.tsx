import { useEffect } from "react";
import { Platform } from "react-native";

import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";

import * as NavigationBar from "expo-navigation-bar";

import { router, Stack } from "expo-router";

import { StatusBar } from "expo-status-bar";

import "react-native-reanimated";

import {
  AuthProvider,
  useAuth,
} from "../contexts/AuthContext";
import { AppThemeProvider, useTheme } from "../contexts/ThemeContext";

export const unstable_settings = {
  anchor: "(tabs)",
};

export default function RootLayout() {
  return (
    <AuthProvider>
      <AppThemeProvider>
        <RootNavigator />
      </AppThemeProvider>
    </AuthProvider>
  );
}

function RootNavigator() {
  const { session, loading } = useAuth();
  const { isDark } = useTheme();

  useEffect(() => {
    if (Platform.OS === "android") {
      NavigationBar.setBehaviorAsync("overlay-swipe");
      NavigationBar.setVisibilityAsync("hidden");
    }
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!session) {
      router.replace("/login");
    }
  }, [session, loading]);

  if (loading) return null;

  return (
    <ThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen
          name="(tabs)"
          options={{ headerShown: false }}
        />

        <Stack.Screen
          name="login"
          options={{ headerShown: false }}
        />

        <Stack.Screen
          name="register"
          options={{ headerShown: false }}
        />

        <Stack.Screen
          name="rule-detail"
          options={{ headerShown: false }}
        />

        <Stack.Screen
          name="notification-detail"
          options={{ headerShown: false }}
        />

        <Stack.Screen
          name="rules"
          options={{ headerShown: false }}
        />

        <Stack.Screen
          name="create-rule"
          options={{ headerShown: false }}
        />

        <Stack.Screen
          name="profile"
          options={{ headerShown: false }}
        />

        <Stack.Screen
          name="manual-rule"
          options={{ headerShown: false }}
        />


      </Stack>

      <StatusBar style={isDark ? "light" : "dark"} />
    </ThemeProvider>
  );
}
