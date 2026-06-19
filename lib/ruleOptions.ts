// Hằng số dùng chung cho rule & notification: danh mục, tần suất, sắc thái

import { Ionicons } from "@expo/vector-icons";

type IoniconName = keyof typeof Ionicons.glyphMap;

export interface CategoryOption {
  key: string;
  label: string;
  icon: IoniconName;
  color: string;
}

export const CATEGORIES: CategoryOption[] = [
  { key: "finance", label: "Tài chính", icon: "cash-outline", color: "#22C55E" },
  { key: "news", label: "Tin tức", icon: "newspaper-outline", color: "#4DA6FF" },
  { key: "tech", label: "Công nghệ", icon: "hardware-chip-outline", color: "#7C3AED" },
  { key: "sports", label: "Thể thao", icon: "football-outline", color: "#F59E0B" },
  { key: "weather", label: "Thời tiết", icon: "partly-sunny-outline", color: "#0EA5E9" },
  { key: "health", label: "Sức khỏe", icon: "heart-outline", color: "#EF4444" },
  { key: "other", label: "Khác", icon: "ellipsis-horizontal-circle-outline", color: "#7B8AA0" },
];

export interface FrequencyOption {
  key: string;
  label: string;
}

// frequency lưu dạng: "change" (theo điều kiện) HOẶC số phút (chuỗi) cho theo dõi định kỳ.
// Định kỳ tối thiểu 30 phút; theo điều kiện hệ thống tự quét 15 phút (không hiện ra).
// Các mốc dưới chỉ là gợi ý chọn nhanh khi chỉnh tay — vẫn nhận số phút bất kỳ ≥30.
export const FREQUENCIES: FrequencyOption[] = [
  { key: "change", label: "Theo điều kiện" },
  { key: "30", label: "Mỗi 30 phút" },
  { key: "60", label: "Mỗi giờ" },
  { key: "480", label: "Mỗi 8 giờ" },
  { key: "1440", label: "Hằng ngày" },
  { key: "10080", label: "Hằng tuần" },
];

// Khóa cũ (enum) → số phút, để tương thích rule đã tạo trước đây.
const LEGACY_FREQ: Record<string, number> = {
  m30: 30, hourly: 60, daily: 1440, weekly: 10080, realtime: 30,
};

// frequency → số phút giữa 2 lần quét. "change" = 15 (nội bộ). Không rõ/định kỳ < 30 → 30.
export function freqMinutes(freq?: string): number {
  if (!freq) return 30;
  if (freq === "change") return 15;
  if (freq in LEGACY_FREQ) return LEGACY_FREQ[freq];
  const n = parseInt(freq, 10);
  return Number.isFinite(n) && n >= 30 ? n : 30;
}

// frequency → nhãn hiển thị thân thiện. Theo điều kiện KHÔNG lộ "15 phút".
export function formatFrequency(freq?: string): string {
  if (freq === "change") return "Theo điều kiện";
  const m = freqMinutes(freq);
  if (m % 10080 === 0) return m === 10080 ? "Hằng tuần" : `Mỗi ${m / 10080} tuần`;
  if (m % 1440 === 0) return m === 1440 ? "Hằng ngày" : `Mỗi ${m / 1440} ngày`;
  if (m % 60 === 0) return `Mỗi ${m / 60} giờ`;
  return `Mỗi ${m} phút`;
}

// Chuẩn hóa frequency của 1 rule về "khóa" để highlight chip khi chỉnh tay.
export function toFreqKey(freq?: string): string {
  if (freq === "change") return "change";
  return String(freqMinutes(freq));
}

// Nhãn lịch đầy đủ: kèm giờ cụ thể nếu có (vd "Hằng ngày lúc 08:00").
export function formatSchedule(freq?: string, runAt?: string): string {
  const base = formatFrequency(freq);
  if (freq !== "change" && runAt && /^\d{1,2}:\d{2}$/.test(runAt)) {
    return `${base} lúc ${runAt}`;
  }
  return base;
}

export interface SentimentOption {
  key: string;
  label: string;
  color: string;
  icon: IoniconName;
}

export const SENTIMENTS: SentimentOption[] = [
  { key: "positive", label: "Tích cực", color: "#22C55E", icon: "trending-up-outline" },
  { key: "neutral", label: "Trung tính", color: "#7B8AA0", icon: "remove-outline" },
  { key: "negative", label: "Tiêu cực", color: "#FF5B7F", icon: "trending-down-outline" },
];

// Helpers tra cứu nhanh
export const findCategory = (key?: string) =>
  CATEGORIES.find((c) => c.key === key) ?? CATEGORIES[CATEGORIES.length - 1];

export const findFrequency = (key?: string) =>
  FREQUENCIES.find((f) => f.key === key);

export const findSentiment = (key?: string) =>
  SENTIMENTS.find((s) => s.key === key);
