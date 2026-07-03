// Cache màn hình kiểu "hiện ngay, làm mới ngầm" (stale-while-revalidate):
// mở app / chuyển tab thì vẽ NGAY dữ liệu lần trước từ AsyncStorage, mạng trả về
// sau thì thay bằng bản mới — hết cảnh màn nào cũng xoay vòng chờ vài giây.
import AsyncStorage from "@react-native-async-storage/async-storage";

export async function loadCache<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

// Fire-and-forget: lưu cache không được phép làm chậm hay làm hỏng luồng chính.
export function saveCache(key: string, value: unknown): void {
  AsyncStorage.setItem(key, JSON.stringify(value)).catch(() => {});
}
