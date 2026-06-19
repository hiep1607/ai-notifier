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

// Tối thiểu 30 phút/lần. Riêng rule theo dõi SỰ THAY ĐỔI quét dày hơn (15 phút).
export const FREQUENCIES: FrequencyOption[] = [
  { key: "change", label: "Theo dõi thay đổi (15 phút)" },
  { key: "m30", label: "Mỗi 30 phút" },
  { key: "hourly", label: "Mỗi giờ" },
  { key: "daily", label: "Hằng ngày" },
  { key: "weekly", label: "Hằng tuần" },
];

// Tần suất → số phút giữa 2 lần quét (dùng cả ở Edge Function run-monitor).
// Legacy/không rõ → 30 phút (mức tối thiểu).
export const FREQUENCY_MINUTES: Record<string, number> = {
  change: 15,
  m30: 30,
  hourly: 60,
  daily: 1440,
  weekly: 10080,
};

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
