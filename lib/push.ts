// Đăng ký Expo push token cho thiết bị → lưu vào bảng push_tokens để server (run-monitor)
// gửi push khi có thông báo mới. An toàn no-op trên web / Expo Go / khi thiếu EAS projectId.

import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { supabase } from "./supabase";

const PUSH_TOKEN_KEY = "@ai-notifier/expo-push-token";

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
      await Notifications.setNotificationChannelAsync("ai-notifier-all", {
        name: "Âm thanh và rung",
        importance: Notifications.AndroidImportance.DEFAULT,
        sound: "default",
        enableVibrate: true,
        vibrationPattern: [0, 250, 250, 250],
      });
      await Notifications.setNotificationChannelAsync("ai-notifier-sound", {
        name: "Chỉ âm thanh",
        importance: Notifications.AndroidImportance.DEFAULT,
        sound: "default",
        enableVibrate: false,
      });
      await Notifications.setNotificationChannelAsync("ai-notifier-vibrate", {
        name: "Chỉ rung",
        importance: Notifications.AndroidImportance.DEFAULT,
        sound: null,
        enableVibrate: true,
        vibrationPattern: [0, 250, 250, 250],
      });
      await Notifications.setNotificationChannelAsync("ai-notifier-silent", {
        name: "Im lặng",
        importance: Notifications.AndroidImportance.DEFAULT,
        sound: null,
        enableVibrate: false,
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

    // RPC lấy user_id từ JWT và có thể chuyển token khỏi tài khoản cũ một cách an toàn.
    // userId chỉ dùng để bảo vệ khỏi effect cũ chạy trễ sau khi session đã đổi.
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData.session?.user.id !== userId) return;
    const { error } = await supabase.rpc("claim_push_token", {
      p_token: token,
      p_platform: Platform.OS,
    });
    if (error) throw error;
    await AsyncStorage.setItem(PUSH_TOKEN_KEY, token);
  } catch (err) {
    // Expo Go (SDK 53+ Android) / từ chối quyền... → im lặng, không làm vỡ app.
    console.log("Push: không đăng ký được token:", err);
  }
}

// Gọi TRƯỚC auth.signOut(). Nếu server không truy cập được, hủy đăng ký push ở native
// để token cũ không còn nhận được thông báo; chỉ chặn logout khi cả hai cách đều thất bại.
export async function unregisterForPush(): Promise<void> {
  if (Platform.OS === "web" || !Device.isDevice) return;
  const token = await AsyncStorage.getItem(PUSH_TOKEN_KEY);
  if (!token) return;

  let serverReleased = false;
  try {
    const { error } = await supabase.rpc("release_push_token", { p_token: token });
    if (!error) serverReleased = true;
  } catch { /* thử vô hiệu hóa token native bên dưới */ }

  if (!serverReleased) {
    try {
      await Notifications.unregisterForNotificationsAsync();
    } catch (err) {
      console.log("Push: không thể gỡ token an toàn:", err);
      throw new Error("Không thể gỡ thông báo đẩy. Hãy kiểm tra mạng rồi thử đăng xuất lại.");
    }
  }
  await AsyncStorage.removeItem(PUSH_TOKEN_KEY);
}
