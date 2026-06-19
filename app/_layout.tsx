import { useEffect } from "react";
import { Platform } from "react-native";

import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";

import * as NavigationBar from "expo-navigation-bar";
import * as Notifications from "expo-notifications";

import { router, Stack } from "expo-router";

import { StatusBar } from "expo-status-bar";

import "react-native-reanimated";

import { registerForPush } from "../lib/push";

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

  // Đăng ký push token sau khi đăng nhập (no-op trên web/Expo Go/thiếu EAS).
  useEffect(() => {
    const uid = session?.user?.id;
    if (uid) registerForPush(uid);
  }, [session?.user?.id]);

  // Chạm vào push → mở đúng thông báo.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((resp) => {
      const id = resp.notification.request.content.data?.notificationId;
      if (id) router.push({ pathname: "/notification-detail", params: { id: String(id) } });
    });
    return () => sub.remove();
  }, []);

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
