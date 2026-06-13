import { Alert, Platform } from "react-native";

/**
 * Hộp thoại xác nhận chạy được trên cả web lẫn mobile.
 * React Native Alert không hoạt động trên web → dùng window.confirm thay thế.
 */
export function confirmAsync(
  title: string,
  message: string
): Promise<boolean> {
  if (Platform.OS === "web") {
    const ok =
      typeof window !== "undefined" && typeof window.confirm === "function"
        ? window.confirm(`${title}\n\n${message}`)
        : true;
    return Promise.resolve(ok);
  }

  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: "Hủy", style: "cancel", onPress: () => resolve(false) },
      { text: "Xóa", style: "destructive", onPress: () => resolve(true) },
    ]);
  });
}

/**
 * Thông báo đơn giản chạy được trên cả web lẫn mobile.
 */
export function alertMessage(title: string, message?: string) {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined" && typeof window.alert === "function") {
      window.alert(message ? `${title}\n\n${message}` : title);
    }
    return;
  }

  Alert.alert(title, message);
}
