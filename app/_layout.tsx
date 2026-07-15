import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";

import { Ionicons } from "@expo/vector-icons";
import { useFonts } from "expo-font";
import * as NavigationBar from "expo-navigation-bar";
import * as Notifications from "expo-notifications";
import * as SplashScreen from "expo-splash-screen";

import AsyncStorage from "@react-native-async-storage/async-storage";

import { router, Stack, usePathname } from "expo-router";

import { StatusBar } from "expo-status-bar";

import "react-native-reanimated";

import { prefetchAppData } from "../lib/prefetch";
import { registerForPush, unregisterForPush } from "../lib/push";
import { startWebAutoUpdate } from "../lib/webAutoUpdate";
import { runNativeAutoUpdate } from "../lib/nativeAutoUpdate";

import {
  AuthProvider,
  useAuth,
} from "../contexts/AuthContext";
import { AppThemeProvider, useTheme } from "../contexts/ThemeContext";

export const unstable_settings = {
  anchor: "(tabs)",
};

// Giữ splash native hiển thị cho tới khi app sẵn sàng — hết chớp màn trắng lúc mở.
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <AppThemeProvider>
            <RootNavigator />
          </AppThemeProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function RootNavigator() {
  const { session, loading } = useAuth();
  const { isDark, colors } = useTheme();
  const pathname = usePathname();
  const previousPushUserId = useRef<string | null>(null);

  // Nạp trước font icon Ionicons — hết cảnh chữ hiện trước, icon nhảy vào sau.
  const [fontsLoaded, fontError] = useFonts({ ...Ionicons.font });
  // Nhưng không để font (mạng chậm trên web) giam app quá 3 giây.
  const [fontWaitOver, setFontWaitOver] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setFontWaitOver(true), 3000);
    return () => clearTimeout(t);
  }, []);

  const ready = !loading && (fontsLoaded || Boolean(fontError) || fontWaitOver);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  useEffect(() => {
    if (Platform.OS === "android") {
      NavigationBar.setBehaviorAsync("overlay-swipe");
      NavigationBar.setVisibilityAsync("hidden");
    }
  }, []);

  // Web: tự phát hiện bản deploy mới và nạp lại.
  // Native (Android/iOS): tự tải & nạp bản OTA mới khi mở app.
  useEffect(() => {
    startWebAutoUpdate();
    runNativeAutoUpdate();
  }, []);

  useEffect(() => {
    // Chờ `ready` (không chỉ `loading`) — Stack chưa mount thì chưa được điều hướng.
    if (!ready) return;
    if (!session) {
      router.replace("/login");
      return;
    }
    // Lần đầu đăng nhập trên thiết bị này → giới thiệu nhanh rồi vào app.
    AsyncStorage.getItem("@onboarded").then((v) => {
      if (!v) router.replace("/onboarding" as any);
    });
  }, [session, ready]);

  // Phòng hờ: getSession chậm hơn timeout 6s → đã lỡ đưa về /login, khi session
  // về muộn qua onAuthStateChange thì tự đưa lại vào app (login tay cũng vô hại).
  useEffect(() => {
    if (ready && session && pathname === "/login") {
      router.replace("/(tabs)");
    }
  }, [session, ready, pathname]);

  // Có session là TẢI TRƯỚC dữ liệu mọi tab (RAM + đĩa) — bấm sang tab nào cũng
  // hiện ngay, không phải chờ mạng. Đăng ký push token (no-op web/Expo Go/thiếu EAS).
  useEffect(() => {
    const uid = session?.user?.id;
    if (uid) {
      prefetchAppData(uid);
      registerForPush(uid);
    } else if (previousPushUserId.current) {
      // Bao phủ cả phiên hết hạn/đăng xuất từ nơi khác, không chỉ hai nút đăng xuất.
      unregisterForPush().catch((err) => console.log("Push: cleanup khi mất session lỗi:", err));
    }
    previousPushUserId.current = uid ?? null;
  }, [session?.user?.id]);

  // Chạm vào push → mở đúng thông báo.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((resp) => {
      const id = resp.notification.request.content.data?.notificationId;
      if (id) router.push({ pathname: "/notification-detail", params: { id: String(id) } });
    });
    return () => sub.remove();
  }, []);

  if (!ready) {
    // Native: splash vẫn đang che nên trả gì cũng không thấy. Web: không có splash
    // → hiện nền + vòng xoay thay cho màn trắng trống trơn.
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.background,
        }}
      >
        {Platform.OS === "web" && <ActivityIndicator size="large" color={colors.primary} />}
      </View>
    );
  }

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

        <Stack.Screen
          name="onboarding"
          options={{ headerShown: false }}
        />

        <Stack.Screen
          name="admin"
          options={{ headerShown: false }}
        />

        <Stack.Screen
          name="admin-users"
          options={{ headerShown: false }}
        />

        <Stack.Screen
          name="admin-user-detail"
          options={{ headerShown: false }}
        />

        <Stack.Screen
          name="admin-notifications"
          options={{ headerShown: false }}
        />

        <Stack.Screen
          name="admin-test"
          options={{ headerShown: false }}
        />

        <Stack.Screen
          name="grant-login"
          options={{ headerShown: false }}
        />


      </Stack>

      <StatusBar style={isDark ? "light" : "dark"} />
    </ThemeProvider>
  );
}
