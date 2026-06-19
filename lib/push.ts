// Đăng ký Expo push token cho thiết bị → lưu vào bảng push_tokens để server (run-monitor)
// gửi push khi có thông báo mới. An toàn no-op trên web / Expo Go / khi thiếu EAS projectId.

import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";

import { supabase } from "./supabase";

// Foreground vẫn hiện banner + âm thanh.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function getProjectId(): string | undefined {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ??
    // @ts-ignore - easConfig có ở runtime build EAS
    Constants.easConfig?.projectId
  );
}

export async function registerForPush(userId: string): Promise<void> {
  // Web cần VAPID (chưa làm) → bỏ qua. Máy ảo không có push.
  if (Platform.OS === "web" || !Device.isDevice) return;

  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Mặc định",
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    if (existing !== "granted") {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== "granted") return;

    const projectId = getProjectId();
    if (!projectId) {
      // Cần `eas init` để có projectId; chưa có thì không lấy được token.
      console.log("Push: thiếu EAS projectId → bỏ qua đăng ký token");
      return;
    }

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    if (!token) return;

    await supabase
      .from("push_tokens")
      .upsert({ user_id: userId, token, platform: Platform.OS }, { onConflict: "token" });
  } catch (err) {
    // Expo Go (SDK 53+ Android) / từ chối quyền... → im lặng, không làm vỡ app.
    console.log("Push: không đăng ký được token:", err);
  }
}
