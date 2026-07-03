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
  source_type?: string | null;  // 'reminder' = rule nhắc hẹn (migration 0016)
  remind_at?: string | null;    // thời điểm nhắc (ISO timestamptz)
}

// Rule nhắc hẹn hợp lệ? (source_type='reminder' + có remind_at parse được)
export function isReminder(rule: SchedulableRule): boolean {
  return rule.source_type === "reminder" &&
    Boolean(rule.remind_at && Number.isFinite(Date.parse(rule.remind_at)));
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

// Rule "đặt giờ" (ghim giờ báo cụ thể, vd hằng ngày 08:00)?
export function isScheduled(rule: SchedulableRule): boolean {
  return rule.frequency !== "change" &&
    Boolean(rule.run_at && /^\d{1,2}:\d{2}$/.test(rule.run_at));
}

// Cho phép BẮN MUỘN tối đa 4 tiếng sau giờ hẹn nếu các lượt trước lỡ (quota 429 /
// deadline 70s cắt). Trước đây khung chỉ [target, +15'): lượt cron 8:00 mà hỏng là
// MẤT NGUYÊN NGÀY — đây chính là lỗi "rule 8h mấy hôm liền không báo".
export const SCHEDULED_CATCHUP_MIN = 240;

// Rule đã tới hạn quét chưa? (cron chạy mỗi 15 phút gọi hàm này cho từng rule)
export function isDue(rule: SchedulableRule, nowMs = Date.now()): boolean {
  const interval = intervalMs(rule.frequency);
  const last = rule.last_run_at ? Date.parse(rule.last_run_at) : 0;
  const elapsed = nowMs - last;

  // NHẮC HẸN: tới hạn khi ĐÃ QUA thời điểm nhắc và CHƯA quét lần nào sau mốc đó.
  // Nhắc muộn vẫn hơn nuốt (không giới hạn catch-up); bắn xong rule tự tắt ở run-monitor.
  if (isReminder(rule)) {
    const remind = Date.parse(String(rule.remind_at));
    return nowMs >= remind && last < remind;
  }

  // Ghim giờ cụ thể: gửi TỪ giờ hẹn (không sớm), lỡ nhịp thì THỬ LẠI các lượt cron sau
  // trong khung catch-up [target, target+4h) cho tới khi quét thành công.
  // Chống bắn lặp: so last_run_at với MỐC HẸN gần nhất (đã quét sau mốc = xong hôm nay).
  if (isScheduled(rule)) {
    const [h, m] = String(rule.run_at).split(":").map(Number);
    const target = h * 60 + m;
    const now = vnMinutesOfDay(nowMs);
    // Số phút TỪ mốc hẹn gần nhất tới now theo vòng 24h (xử lý cả mốc gần nửa đêm).
    const diff = (now - target + 1440) % 1440;
    if (diff >= SCHEDULED_CATCHUP_MIN) return false; // chưa tới giờ / quá muộn (bỏ mốc này)
    // Thời điểm mốc hẹn gần nhất (xấp xỉ theo phút — đệm 1' khi so để bỏ jitter giây).
    const targetMs = nowMs - diff * 60000;
    if (last >= targetMs - 60000) return false; // mốc này đã quét rồi → thôi
    // Guard chu kỳ (rule hằng tuần không bắn mỗi ngày). Trừ hao 5h (4h catch-up + 1h)
    // để hôm qua bắn muộn không làm trượt mốc đúng giờ của hôm nay.
    return elapsed >= interval - 5 * 3600000;
  }

  // Không ghim giờ: theo chu kỳ thuần (KHÔNG quét sớm — quét sớm sẽ làm trôi tần suất).
  return elapsed >= interval;
}

// Thời điểm rule "đáng lẽ phải báo" — dùng để sắp thứ tự ưu tiên khi quét.
// NHẮC HẸN: mốc báo chính là remind_at (không phải last_run_at + chu kỳ) → reminder tới
// hạn tự lên ĐẦU hàng đợi, được xử lý trước các rule tin tức (nó nhạy thời gian nhất
// và 0 tốn AI nên xử lý tức thì).
export function dueAt(rule: SchedulableRule): number {
  if (isReminder(rule)) return Date.parse(String(rule.remind_at));
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

// ---------- ROUTER NGUỒN DỮ LIỆU (Pha A) ----------
// Mỗi loại theo dõi có nguồn CHUYÊN BIỆT (API thật, 0 quota grounding); "search" =
// Gemini + Google Search như cũ, đồng thời là fallback khi provider lỗi.
// Phân loại bằng heuristic từ keyword — chạy lúc quét nên RULE CŨ tự hưởng, không cần migration.
export type SourceType = "search" | "weather" | "crypto" | "fx" | "url";

// Coin phổ biến → id CoinGecko. Chỉ nhận khi keyword có ý "giá" (tránh cướp rule tin tức).
export const COIN_MAP: { re: RegExp; id: string; name: string }[] = [
  { re: /\b(btc|bitcoin)\b/i, id: "bitcoin", name: "Bitcoin" },
  { re: /\b(eth|ethereum)\b/i, id: "ethereum", name: "Ethereum" },
  { re: /\b(bnb)\b/i, id: "binancecoin", name: "BNB" },
  { re: /\b(sol|solana)\b/i, id: "solana", name: "Solana" },
  { re: /\b(xrp|ripple)\b/i, id: "ripple", name: "XRP" },
  { re: /\b(doge|dogecoin)\b/i, id: "dogecoin", name: "Dogecoin" },
  { re: /\b(ada|cardano)\b/i, id: "cardano", name: "Cardano" },
  { re: /\b(ton|toncoin)\b/i, id: "the-open-network", name: "Toncoin" },
];

export function matchCoin(keyword: string): { id: string; name: string } | null {
  const hit = COIN_MAP.find((c) => c.re.test(keyword));
  return hit ? { id: hit.id, name: hit.name } : null;
}

// URL đầu tiên trong text (dùng nhận diện rule "theo dõi trang web cụ thể").
// Cắt dấu câu bám đuôi ( ) . , " thường gặp khi URL nằm giữa câu.
export function extractWatchUrl(text?: string): string {
  const m = String(text ?? "").match(/https?:\/\/[^\s<>"')\]]+/i);
  if (!m) return "";
  return m[0].replace(/[.,;!?]+$/, "");
}

export function detectSourceType(keyword?: string): SourceType {
  const k = (keyword ?? "").toLowerCase();
  if (!k.trim()) return "search";
  // Có URL cụ thể trong keyword → theo dõi TRANG đó (ưu tiên trước mọi heuristic khác).
  if (extractWatchUrl(k)) return "url";
  if (/thời tiết|thoi tiet|dự báo thời tiết|nhiệt độ|nhiet do|weather/.test(k)) return "weather";
  // crypto/fx: phải có ý "giá/tỷ giá" — "tin tức bitcoin" vẫn là rule TIN TỨC (search).
  const priceIntent = /giá|gia\b|price|tỷ giá|ty gia/.test(k);
  if (priceIntent && matchCoin(k)) return "crypto";
  if (/tỷ giá|ty gia|usd\/vnd|đô la mỹ|do la my|exchange rate/.test(k)) return "fx";
  return "search";
}

// Tách ĐỊA DANH khỏi keyword thời tiết: "dự báo thời tiết Thanh Hóa hôm nay" → "Thanh Hóa".
// Trả "" nếu không còn gì (caller sẽ fallback search).
export function extractWeatherLocation(keyword: string): string {
  return keyword
    .replace(/dự báo|du bao|thời tiết|thoi tiet|nhiệt độ|nhiet do|weather|forecast|hôm nay|hom nay|ngày mai|ngay mai|tuần này|tuan nay|hằng ngày|hang ngay|mỗi ngày|moi ngay|khu vực|khu vuc|thành phố|thanh pho|tại|\bở\b|\bo\b|có mưa không|co mua khong/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Mã thời tiết WMO (Open-Meteo trả về) → mô tả tiếng Việt.
export function wmoDesc(code: number): string {
  if (code === 0) return "Trời quang";
  if (code === 1) return "Trời quang, ít mây";
  if (code === 2) return "Mây rải rác";
  if (code === 3) return "Nhiều mây";
  if (code === 45 || code === 48) return "Sương mù";
  if (code >= 51 && code <= 57) return "Mưa phùn";
  if (code >= 61 && code <= 67) return "Mưa";
  if (code >= 71 && code <= 77) return "Tuyết";
  if (code >= 80 && code <= 82) return "Mưa rào";
  if (code === 85 || code === 86) return "Mưa tuyết";
  if (code === 95) return "Dông";
  if (code === 96 || code === 99) return "Dông kèm mưa đá";
  return "Không rõ";
}

export function fmtNum(n: number, digits = 0): string {
  return n.toLocaleString("vi-VN", { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

// Ngày dd/MM theo giờ VN — gắn vào tiêu đề bản tin cho unique theo ngày.
export function vnDateStr(nowMs = Date.now()): string {
  const vn = new Date(nowMs + 7 * 3600000);
  return `${String(vn.getUTCDate()).padStart(2, "0")}/${String(vn.getUTCMonth() + 1).padStart(2, "0")}`;
}

// Biến động ĐÁNG KỂ giữa 2 giá trị dạng "12345.6 USD"? Không parse được số → coi là ĐỔI
// (an toàn: thà báo thừa 1 lần lúc chuyển định dạng còn hơn nuốt tin).
export function significantChange(prev: string | null | undefined, cur: string, pct = 1): boolean {
  const p = parseFloat(String(prev ?? "").match(/-?\d+(\.\d+)?/)?.[0] ?? "");
  const c = parseFloat(String(cur).match(/-?\d+(\.\d+)?/)?.[0] ?? "");
  if (!Number.isFinite(p) || !Number.isFinite(c)) return true;
  if (p === 0) return c !== 0;
  return (Math.abs(c - p) / Math.abs(p)) * 100 >= pct;
}

// ---------- COMPOSE BẢN TIN PROVIDER (Pha B — thuần, test được) ----------

export interface ProviderNotif {
  title: string;
  content: string;
  details: string;
  ai_summary: string;
  source: string;
  source_url: string;
  value: string; // giá trị máy-đọc-được để so biến động lần sau (số đứng đầu)
}

export interface WeatherDaily {
  code: number;
  tmax: number;
  tmin: number;
  rainPct: number;
  windMax: number;
}

export function composeWeatherNotif(
  place: string,
  curTemp: number,
  curCode: number,
  today: WeatherDaily,
  tomorrow: WeatherDaily | null,
  nowMs = Date.now(),
): ProviderNotif {
  const desc = wmoDesc(today.code);
  const range = `${fmtNum(today.tmin)}–${fmtNum(today.tmax)}°C`;
  const line = (d: WeatherDaily) =>
    `${wmoDesc(d.code)}, ${fmtNum(d.tmin)}–${fmtNum(d.tmax)}°C, xác suất mưa ${fmtNum(d.rainPct)}%, gió tối đa ${fmtNum(d.windMax)} km/h`;
  return {
    title: `Thời tiết ${place} ${vnDateStr(nowMs)}: ${desc}, ${range}`,
    content: `Hiện tại ${fmtNum(curTemp)}°C (${wmoDesc(curCode).toLowerCase()}). Hôm nay: ${line(today)}.`,
    details: tomorrow ? `Ngày mai: ${line(tomorrow)}.` : "",
    ai_summary: `${place}: ${desc}, ${range}, mưa ${fmtNum(today.rainPct)}%.`,
    source: "Open-Meteo",
    source_url: "https://open-meteo.com/",
    value: `${curTemp}°C; ${today.tmin}-${today.tmax}°C; mưa ${today.rainPct}%; ${desc}`,
  };
}

export function composeCryptoNotif(
  coinId: string,
  name: string,
  usd: number,
  vnd: number | null,
  chg24: number | null,
): ProviderNotif {
  const digits = usd < 1 ? 4 : usd < 100 ? 2 : 0;
  const chgTxt = chg24 == null ? "" : ` (${chg24 >= 0 ? "+" : ""}${chg24.toFixed(2)}% 24h)`;
  return {
    title: `${name}: ${fmtNum(usd, digits)} USD${chgTxt}`,
    content: `Giá ${name} hiện ${fmtNum(usd, digits)} USD${vnd != null ? ` (~${fmtNum(vnd)} đ)` : ""}${chg24 != null ? `, thay đổi 24 giờ ${chg24 >= 0 ? "+" : ""}${chg24.toFixed(2)}%` : ""}. Số liệu trực tiếp từ CoinGecko.`,
    details: "",
    ai_summary: `${name} ${fmtNum(usd, digits)} USD${chgTxt}.`,
    source: "CoinGecko",
    source_url: `https://www.coingecko.com/en/coins/${coinId}`,
    value: `${usd} USD`,
  };
}

export function composeFxNotif(vndPerUsd: number, prevValue?: string | null): ProviderNotif {
  const prevNum = parseFloat(String(prevValue ?? "").match(/-?\d+(\.\d+)?/)?.[0] ?? "");
  const diff = Number.isFinite(prevNum) && prevNum > 0
    ? ` (lần trước ${fmtNum(prevNum)} đ, ${vndPerUsd >= prevNum ? "+" : ""}${fmtNum(vndPerUsd - prevNum)} đ)`
    : "";
  return {
    title: `Tỷ giá USD/VND: ${fmtNum(vndPerUsd)} đ`,
    content: `1 USD đổi được khoảng ${fmtNum(vndPerUsd)} đồng${diff}. Tỷ giá THAM KHẢO thị trường (không phải giá niêm yết ngân hàng).`,
    details: "",
    ai_summary: `USD/VND ${fmtNum(vndPerUsd)} đ${diff ? " — có thay đổi so với lần trước" : ""}.`,
    source: "ExchangeRate-API",
    source_url: "https://open.er-api.com/",
    value: `${vndPerUsd} VND`,
  };
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
// ---------- THEO DÕI TRANG WEB CỤ THỂ (Pha E — phần thuần, test được) ----------

// Chặn SSRF: run-monitor chạy với service_role nên TUYỆT ĐỐI không được fetch vào
// mạng nội bộ/metadata theo URL người dùng đưa. Chặn hostname/IP private phổ biến.
export function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, ""); // bỏ ngoặc IPv6
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (h === "::1" || h === "0.0.0.0" || h === "") return true;
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;              // link-local / cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }
  if (/^(fc|fd|fe8|fe9|fea|feb)/.test(h.replace(/:/g, ""))) return true; // IPv6 ULA/link-local
  return false;
}

// URL hợp lệ để theo dõi? (http/https + không trỏ vào mạng nội bộ)
export function isWatchableUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    return !isPrivateHost(u.hostname);
  } catch {
    return false;
  }
}

// watch_auth người dùng dán → headers gửi kèm khi fetch trang cần đăng nhập.
// Chấp nhận 2 dạng: từng dòng "Header-Name: value" (Cookie/Authorization/X-...-Token...),
// hoặc dán THẲNG chuỗi cookie ("session=abc; user=1") → coi là header Cookie.
export function parseWatchAuth(raw?: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  const text = String(raw ?? "").trim();
  if (!text) return out;
  for (const line of text.split(/\r?\n/)) {
    const s = line.trim();
    if (!s) continue;
    const m = s.match(/^([A-Za-z][A-Za-z0-9-]*)\s*:\s*(.+)$/);
    if (m) out[m[1]] = m[2].trim();
    else out["Cookie"] = out["Cookie"] ? `${out["Cookie"]}; ${s}` : s; // dòng trần = cookie
  }
  return out;
}

// HTML → text đọc được cho AI: bỏ script/style, bỏ tag, gọn khoảng trắng, cắt trần.
// Regex là đủ ở đây (chỉ cần text thô cho AI đọc, không cần DOM chuẩn).
export function stripHtml(html: string, maxChars = 12000): string {
  const text = String(html ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(br|\/p|\/div|\/li|\/tr|\/h[1-6])[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
  return text.length > maxChars ? text.slice(0, maxChars) : text;
}

// QUY ĐỔI link người dùng dán dạng "thường" sang link ĐỌC ĐƯỢC bằng fetch tĩnh.
// Đã kiểm chứng thực tế 2026-07-03:
//  - t.me/kênh chỉ có card giới thiệu, bản t.me/s/kênh mới hiện nội dung bài;
//  - reddit HTML mới là SPA không khai feed, nhưng thêm /.rss là có feed chuẩn;
//  - bsky.app/profile/x có feed tại .../rss (trang cũng khai báo, đổi thẳng đỡ 1 fetch);
//  - youtube.com/channel/UC… bị chặn bot nhưng feeds/videos.xml?channel_id=UC… mở tự do.
// Không khớp mẫu nào → giữ nguyên (trang thường đã có auto-discovery feed lo).
export function normalizeWatchUrl(url: string): string {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return url;
  }
  const host = u.hostname.replace(/^www\./i, "").toLowerCase();
  const path = u.pathname.replace(/\/+$/, "");

  // Telegram: kênh công khai (1 segment, không phải link mời "+xxx" hay đã /s/).
  if (host === "t.me" && /^\/[A-Za-z0-9_]+$/.test(path) && !path.startsWith("/s/")) {
    return `https://t.me/s${path}`;
  }
  // Reddit: subreddit / trang user → feed .rss.
  if ((host === "reddit.com" || host.endsWith(".reddit.com")) && /^\/(r|user)\/[^/]+$/.test(path)) {
    return `https://www.reddit.com${path}/.rss`;
  }
  // Bluesky: profile → feed RSS chính chủ.
  if (host === "bsky.app") {
    const m = path.match(/^\/profile\/([^/]+)$/);
    if (m) return `https://bsky.app/profile/${m[1]}/rss`;
  }
  // YouTube: link kênh dạng /channel/UC… → feed video chính thức (dạng /@tên KHÔNG đổi
  // được — không suy ra channel_id nếu không fetch, mà trang @tên lại chặn bot).
  if (host === "youtube.com" || host === "m.youtube.com") {
    const m = path.match(/^\/channel\/(UC[\w-]+)/);
    if (m) return `https://www.youtube.com/feeds/videos.xml?channel_id=${m[1]}`;
  }
  return url;
}

// Body fetch về là FEED (XML) chứ không phải trang HTML? — người dùng/normalizeWatchUrl
// có thể đưa thẳng link .rss/.atom/feeds/videos.xml → xử lý dạng feed, khỏi bóc HTML.
export function looksLikeFeed(body: string): boolean {
  const head = String(body ?? "").slice(0, 1000).toLowerCase();
  if (head.includes("<html")) return false;
  return /<rss[\s>]|<feed[\s>]|<rdf:rdf/.test(head);
}

// Feed RSS/Atom mà TRANG TỰ KHAI BÁO trong <head> (rel="alternate" type="application/rss+xml").
// Trang tin tức (Tuổi Trẻ, CafeF, blog WordPress...) đa số có — ưu tiên đọc feed thay vì
// bóc HTML: tiêu đề + link bài CHUẨN, dedup ổn định. Trả "" nếu trang không khai báo.
export function discoverFeedUrl(html: string, baseUrl: string): string {
  const tags = String(html ?? "").match(/<link\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    if (!/rel=["']?alternate["']?/i.test(tag)) continue;
    if (!/type=["']?application\/(rss|atom)\+xml/i.test(tag)) continue;
    const href = tag.match(/href=["']([^"']+)["']/i)?.[1];
    if (!href) continue;
    try {
      return new URL(href, baseUrl).toString();
    } catch { /* href hỏng → thử tag sau */ }
  }
  return "";
}

// Link bài viết trên trang (anchor có text đủ dài = khả năng cao là TIÊU ĐỀ bài).
// Dùng cho trang tin KHÔNG khai báo feed: đưa danh sách cho AI chọn → thông báo
// trỏ về link BÀI THẬT thay vì trang chủ. Bóc từ HTML thô (trước khi stripHtml xóa tag).
export interface PageLink {
  text: string;
  url: string;
}

export function extractPageLinks(html: string, baseUrl: string, max = 25, minTextLen = 20): PageLink[] {
  const out: PageLink[] = [];
  const seen = new Set<string>();
  const re = /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(String(html ?? ""))) && out.length < max) {
    const text = m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (text.length < minTextLen) continue; // menu/nút ngắn → bỏ, chỉ giữ tiêu đề bài
    let url: string;
    try {
      url = new URL(m[1], baseUrl).toString();
    } catch {
      continue;
    }
    if (!/^https?:/i.test(url)) continue;
    const key = normTitle(text);
    if (seen.has(key)) continue; // trang hay lặp link (ảnh + tiêu đề cùng bài)
    seen.add(key);
    out.push({ text: text.slice(0, 200), url });
  }
  return out;
}

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
