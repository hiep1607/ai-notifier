// Theme dùng chung cho toàn app — gom màu/spacing/radius về 1 nơi.
// Trước đây mỗi màn tự khai báo COLORS riêng (lệch nhau nhẹ) → nay thống nhất ở đây.

export const COLORS = {
  background: "#081120",
  card: "#101B35",
  cardAlt: "#0C1730",
  inputBg: "#09152D",

  primary: "#4DA6FF",
  primaryDark: "#2563EB",
  accent: "#7C3AED",

  text: "#FFFFFF",
  subText: "#8FA1C7",
  muted: "#7B8AA0",

  border: "#1E2B4A",

  success: "#22C55E",
  warning: "#F59E0B",
  danger: "#FF5B7F",

  // Nền badge mờ (dùng với màu category: color + ALPHA)
  badgeAlpha: "22",
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 14,
  lg: 20,
  xl: 28,
};

export const RADIUS = {
  sm: 12,
  md: 16,
  lg: 22,
  xl: 28,
  pill: 999,
};

export const FONT = {
  h1: 30,
  h2: 24,
  h3: 18,
  body: 15,
  small: 13,
};

// Glow nhẹ cho nút/icon nổi bật
export const GLOW = {
  shadowColor: COLORS.primary,
  shadowOffset: { width: 0, height: 0 },
  shadowOpacity: 0.45,
  shadowRadius: 12,
  elevation: 8,
};

// Padding chuẩn cho màn hình (đồng bộ với các màn hiện tại)
export const SCREEN = {
  paddingTop: 70,
  paddingHorizontal: 20,
};
