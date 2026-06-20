// Tự cập nhật bản native (Android/iOS) qua EAS Update (OTA): khi mở app, kiểm tra có
// bản JS mới đã publish không; có thì tải về và nạp lại ngay — đỡ phải gỡ + cài lại APK.
// No-op trên web, trong Expo Go và bản dev (Updates.isEnabled = false ở các môi trường đó).
import * as Updates from "expo-updates";
import { Platform } from "react-native";

let started = false;

export async function runNativeAutoUpdate() {
  if (started || Platform.OS === "web") return;
  started = true;
  // Updates.isEnabled = false trong dev/Expo Go => bỏ qua an toàn.
  if (!Updates.isEnabled) return;
  try {
    const res = await Updates.checkForUpdateAsync();
    if (res.isAvailable) {
      await Updates.fetchUpdateAsync();
      await Updates.reloadAsync(); // nạp lại ngay với bản mới
    }
  } catch {
    // Mất mạng / lỗi tạm => giữ bản hiện tại, lần mở sau thử lại.
  }
}
