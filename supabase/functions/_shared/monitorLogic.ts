// Logic THUẦN của run-monitor (lịch quét, chuẩn hóa, chọn tin, độ tươi).
// KHÔNG import Deno API / supabase — để jest (node) test được cùng 1 code chạy thật.
// run-monitor/index.ts import từ đây; __tests__/lib/monitorLogic.test.ts cũng vậy.

// ---------- LỊCH QUÉT ----------

// frequency lưu dạng "change" (theo điều kiện → quét 60 phút) HOẶC số phút (định kỳ, tối thiểu 30).
// Khóa cũ (enum) vẫn được map để tương thích rule tạo trước đây.
export const LEGACY_FREQ: Record<string, number> = {
  m30: 30, hourly: 60, daily: 1440, weekly: 10080, realtime: 30,
};

export function intervalMs(freq?: string): number {
  let mins = 30;
  // Giãn nhịp để né 429 grounding free tier: "theo điều kiện" 15→60 phút.
  if (freq === "change") mins = 60;
  else if (freq && freq in LEGACY_FREQ) mins = LEGACY_FREQ[freq];
  else {
    const n = parseInt(freq ?? "", 10);
    if (Number.isFinite(n) && n >= 30) mins = n;
  }
  return mins * 60000;
}

// Rule tối thiểu mà logic lịch cần (Rule đầy đủ ở run-monitor thỏa interface này).
export interface SchedulableRule {
  frequency?: string;
  run_at?: string | null;
  last_run_at?: string | null;
}

// Số phút từ 0h theo GIỜ VIỆT NAM (server chạy UTC, VN = UTC+7, không có DST).
export function vnMinutesOfDay(nowMs = Date.now()): number {
  const vn = new Date(nowMs + 7 * 3600000);
  return vn.getUTCHours() * 60 + vn.getUTCMinutes();
}

// Giờ hiện tại (0..24) theo VN, có lẻ phút (vd 7.5 = 7h30) để so với khung yên lặng.
export function vnHourNow(nowMs = Date.now()): number {
  return vnMinutesOfDay(nowMs) / 60;
}

// Đang trong khung "giờ yên lặng" [start, end)? Hỗ trợ vắt qua nửa đêm (vd 22→7).
export function isQuietNow(start: number, end: number, hour: number): boolean {
  if (start === end) return false; // khung rỗng → không yên lặng
  if (start < end) return hour >= start && hour < end;
  return hour >= start || hour < end; // vắt qua nửa đêm
}

// Rule đã tới hạn quét chưa? (cron chạy mỗi 15 phút gọi hàm này cho từng rule)
export function isDue(rule: SchedulableRule, nowMs = Date.now()): boolean {
  const interval = intervalMs(rule.frequency);
  const last = rule.last_run_at ? Date.parse(rule.last_run_at) : 0;
  const elapsed = nowMs - last;

  // Ghim giờ cụ thể (định kỳ, không phải "change"): gửi ĐÚNG GIỜ, không sớm.
  // Khung [target, target+15): bắn ngay từ mốc giờ, trễ tối đa 15' (do cron 15'/lần).
  // Guard chu kỳ (1 lần/ngày...) tránh bắn lặp trong cùng ngày.
  if (rule.frequency !== "change" && rule.run_at && /^\d{1,2}:\d{2}$/.test(rule.run_at)) {
    const [h, m] = rule.run_at.split(":").map(Number);
    const target = h * 60 + m;
    const now = vnMinutesOfDay(nowMs);
    // Số phút TỪ target tới now theo vòng 24h (xử lý cả mốc gần nửa đêm).
    const diff = (now - target + 1440) % 1440;
    if (diff >= 15) return false; // chỉ trong 15' kể từ giờ hẹn
    return elapsed >= interval - 3600000; // trừ 1h hao để chắc chắn bắt được khung
  }

  // Không ghim giờ: theo chu kỳ thuần (KHÔNG quét sớm — quét sớm sẽ làm trôi tần suất).
  return elapsed >= interval;
}

// Thời điểm rule "đáng lẽ phải báo" — dùng để sắp thứ tự ưu tiên khi quét.
export function dueAt(rule: SchedulableRule): number {
  return (rule.last_run_at ? Date.parse(rule.last_run_at) : 0) + intervalMs(rule.frequency);
}

// ---------- CHUẨN HÓA & CHỌN TIN ----------

export function normTitle(t: string): string {
  return t.toLowerCase().replace(/\s+/g, " ").trim();
}

export function normVal(s: string): string {
  return s.toLowerCase().replace(/\s+/g, "");
}

// Tiêu đề filler do hệ thống tự sinh (không phải bài báo) — loại khỏi danh sách
// "tránh chọn lại" gửi cho Gemini, kẻo phí chỗ trong prompt.
const FILLER_PREFIX = /^(chưa có thay đổi mới|gợi ý liên quan|chưa tìm thấy thông tin)\s*:/i;

export function isFillerTitle(title: string): boolean {
  return FILLER_PREFIX.test(title.trim());
}

// Danh sách tiêu đề BÀI THẬT đã gửi gần nhất (bỏ filler) — đưa vào prompt để Gemini né.
export function recentRealTitles(titles: (string | null | undefined)[], limit = 8): string[] {
  const out: string[] = [];
  for (const t of titles) {
    const s = String(t ?? "").trim();
    if (!s || isFillerTitle(s)) continue;
    out.push(s);
    if (out.length >= limit) break;
  }
  return out;
}

// Bài quá cũ? published_date không parse được / rỗng → coi như KHÔNG cũ (giữ lại),
// vì nhiều chủ đề số liệu (giá, thời tiết) không có ngày rõ ràng.
export function isTooOld(publishedDate: string | undefined, maxDays: number, nowMs = Date.now()): boolean {
  const s = String(publishedDate ?? "").trim();
  if (!s) return false;
  const t = Date.parse(s);
  if (!Number.isFinite(t)) return false;
  return nowMs - t > maxDays * 86400000;
}

// Item tối thiểu mà bộ chọn cần (NewsItem đầy đủ ở run-monitor thỏa interface này).
export interface PickableItem {
  title?: string;
  value?: string;
  published_date?: string;
}

export interface PickResult<T> {
  top?: T;        // ứng viên được chọn (bài đầu tiên CHƯA TRÙNG; nếu tất cả trùng → bài đầu tiên)
  fresh: boolean; // top có phải bài chưa trùng không
}

// Chọn ứng viên từ danh sách Gemini trả về (đã sắp theo mức đáng chú ý giảm dần):
// - bỏ bài quá cũ (theo published_date, nếu có);
// - lấy bài ĐẦU TIÊN chưa trùng tiêu đề đã gửi (hoặc trùng nhưng số liệu ĐÃ ĐỔI);
// - tất cả đều trùng → trả bài đầu tiên với fresh=false (để nhánh fallback còn dữ liệu dùng).
export function pickFreshItem<T extends PickableItem>(
  items: T[],
  seenTitles: Set<string>,
  lastValNorm: string,
  maxAgeDays = 7,
  nowMs = Date.now(),
): PickResult<T> {
  const usable = items.filter((it) => !isTooOld(it.published_date, maxAgeDays, nowMs));
  const pool = usable.length > 0 ? usable : items; // tất cả bị coi là cũ → đừng vứt hết, giữ nguyên
  for (const it of pool) {
    const titleNorm = normTitle(String(it.title ?? ""));
    if (titleNorm === "") continue;
    const v = normVal(String(it.value ?? "").trim());
    const valueChanged = v !== "" && lastValNorm !== "" && v !== lastValNorm;
    if (!seenTitles.has(titleNorm) || valueChanged) return { top: it, fresh: true };
  }
  return { top: pool[0], fresh: false };
}
