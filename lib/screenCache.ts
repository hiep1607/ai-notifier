// Cache màn hình kiểu "hiện ngay, làm mới ngầm" (stale-while-revalidate):
// mở app / chuyển tab thì vẽ NGAY dữ liệu lần trước, mạng trả về sau thì thay
// bằng bản mới — hết cảnh màn nào cũng xoay vòng chờ vài giây.
//
// 2 tầng: RAM (Map, đọc ĐỒNG BỘ — dùng được ngay trong useState initializer)
// + AsyncStorage (đĩa, sống qua các lần mở app). Prefetch lúc mở app sẽ kéo
// đĩa → RAM rồi tải bản mới từ mạng, nên bấm sang tab nào cũng có sẵn dữ liệu.
import AsyncStorage from "@react-native-async-storage/async-storage";

const mem = new Map<string, unknown>();

// Đọc đồng bộ từ RAM — cho useState(() => ...) vẽ dữ liệu ngay khung hình đầu.
export function getMemCache<T>(key: string): T | null {
  return mem.has(key) ? (mem.get(key) as T) : null;
}

export async function loadCache<T>(key: string): Promise<T | null> {
  if (mem.has(key)) return mem.get(key) as T;
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as T;
    mem.set(key, parsed);
    return parsed;
  } catch {
    return null;
  }
}

// Fire-and-forget: lưu cache không được phép làm chậm hay làm hỏng luồng chính.
export function saveCache(key: string, value: unknown): void {
  mem.set(key, value);
  AsyncStorage.setItem(key, JSON.stringify(value)).catch(() => {});
}
