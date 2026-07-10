// Edge Function: giám sát tin THẬT bằng Gemini + Google Search grounding.
// Gemini tự tìm tin mới nhiều nguồn theo keyword/điều kiện của rule → trả JSON →
// chống trùng theo source_url → insert vào notifications (dùng service role, bỏ qua RLS).
//
// Gọi được 3 cách:
//  - { ruleId }  : 1 rule (nút "Kiểm tra tin ngay")
//  - { userId }  : mọi rule active của 1 user (khi mở app)
//  - {}          : MỌI rule active (pg_cron chạy nền 24/7)
//
// PHÂN QUYỀN: anon key là CÔNG KHAI (nằm trong mọi bản app), nên không thể tin nó.
//  - Cron gọi với SERVICE_ROLE key (role "service_role") → chế độ ADMIN: quét toàn bộ,
//    được truyền userId/ruleId tùy ý.
//  - Người dùng gọi từ app → kèm JWT đăng nhập; ta xác thực JWT, LẤY userId TỪ TOKEN
//    (bỏ qua userId trong body) và chỉ cho quét rule của chính họ. Với ruleId thì
//    kiểm tra quyền sở hữu. Không có JWT hợp lệ → 401, không phải chủ rule → 403.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";
import { CHEAP_FALLBACK, geminiGenerate, parseJsonLoose, GeminiSource } from "../_shared/gemini.ts";
// Logic thuần (lịch quét / chuẩn hóa / chọn tin) tách ra module share để jest test được.
import {
  intervalMs,
  isDue,
  isScheduled,
  isTickDue,
  dueAt,
  scanTier,
  contentFingerprint,
  normLink,
  vnHourNow,
  isQuietNow,
  normTitle,
  normVal,
  isFillerTitle,
  recentRealTitles,
  pickFreshItem,
  detectSourceType,
  significantChange,
  isReminder,
  extractWatchUrl,
  discoverFeedUrl,
  extractPageLinks,
  isWatchableUrl,
  normalizeWatchUrl,
  looksLikeFeed,
  type PageLink,
  type SourceType,
  type ProviderNotif,
} from "../_shared/monitorLogic.ts";
import { fetchWeatherNotif, fetchCryptoNotif, fetchFxNotif } from "../_shared/providers.ts";
import { fetchWatchPage, type WatchPage } from "../_shared/webwatch.ts";
import { feedsForCategory, parseRss, mergeRssItems, sourceFromLink, type RssItem } from "../_shared/rss.ts";

// Lỗi hết quota / quá tải tạm thời từ Gemini → nên DỪNG sớm thay vì đốt thêm request.
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isQuotaErr(e: unknown): boolean {
  const m = (e instanceof Error ? e.message : String(e)).toLowerCase();
  return m.includes("429") || m.includes("resource_exhausted") || m.includes("quota") ||
    m.includes("rate") || m.includes("503") || m.includes("overloaded");
}

// Rule KHÔNG tốn AI: nhắc hẹn (chỉ lịch + push) và rule số liệu provider (thời tiết/
// coin/tỷ giá) KHÔNG có điều kiện (chấm điều kiện phải nhờ flash-lite). Khi AI kẹt
// quota giữa lượt quét, các rule này vẫn quét tiếp được — không chết chùm.
function isAiFreeRule(r: Rule): boolean {
  if (isReminder(r)) return true;
  if (ruleWatchUrl(r)) return false;
  if (r.condition && r.condition.trim()) return false;
  const t = detectSourceType(r.keyword);
  return t === "weather" || t === "crypto" || t === "fx";
}

interface Rule {
  id: string;
  user_id?: string;
  keyword: string;
  category?: string;
  sources?: string;
  condition?: string;
  frequency?: string;
  run_at?: string | null;   // "HH:MM" giờ VN, ghim giờ báo cụ thể
  last_run_at?: string | null;
  last_value?: string | null; // số liệu chính lần quét trước (trigger "thay đổi")
  muted?: boolean;          // true = vẫn tạo notification nhưng KHÔNG đẩy push (để êm)
  notify_mode?: string;     // "important" = bỏ fallback + chỉ báo tin quan trọng/thỏa điều kiện; mặc định "all"
  source_type?: string | null; // 'reminder' = rule nhắc hẹn (migration 0016); mặc định 'search'
  remind_at?: string | null;   // thời điểm nhắc (ISO) — chỉ dùng với reminder
  watch_url?: string | null;   // URL trang cần theo dõi (migration 0018, source_type='url')
  watch_auth?: string | null;  // cookie/headers người dùng cấp cho trang cần đăng nhập
  last_content_hash?: string | null; // vân tay nội dung trang lần trước (0023) — trang y nguyên thì khỏi gọi AI
  title?: string;           // tên rule (reminder dùng làm nội dung nhắc)
  description?: string;     // mô tả rule (reminder dùng làm ghi chú)
  is_active: boolean;
}

// Đọc field "role" trong payload JWT (không verify chữ ký — chỉ để phân loại; quyền
// thật vẫn do platform verify_jwt + auth.getUser bên dưới đảm bảo).
function decodeJwtRole(token: string): string | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const norm = payload.replace(/-/g, "+").replace(/_/g, "/");
    const obj = JSON.parse(atob(norm)) as { role?: unknown };
    return typeof obj.role === "string" ? obj.role : null;
  } catch {
    return null;
  }
}

interface NewsItem {
  title: string;
  content: string;
  details: string;
  ai_summary: string;
  source: string;
  source_url: string;
  published_date: string; // ngày đăng bài "YYYY-MM-DD" ("" nếu không rõ) — lọc bài quá cũ
  sentiment: string;
  is_important: boolean;
  matches_condition: boolean;
  value: string;          // số liệu chính hiện tại (vd "75,2 triệu/lượng", "2.650 USD") — "" nếu chủ đề không có số
  changed: boolean;       // có thay đổi đáng kể so với giá trị lần trước không (dùng để trigger "thay đổi")
}

const SEARCH_SYSTEM =
  `Bạn là AI giám sát tin tức tiếng Việt. Bạn DÙNG Google Search để tìm tin THẬT, MỚI NHẤT.
TUYỆT ĐỐI KHÔNG bịa tin, không bịa số liệu, không bịa URL. Chỉ dùng thông tin từ kết quả tìm được.
Ưu tiên nguồn uy tín (VnExpress, Tuổi Trẻ, Thanh Niên, Dân Trí, CafeF, VietnamNet...).

QUY TẮC TRÌNH BÀY (áp dụng cho MỌI thông báo):
- Khi có thay đổi số liệu (giá, lãi suất, %, mức độ...): LUÔN nêu RÕ "từ [mức CŨ] → [mức MỚI]" kèm mức chênh, KHÔNG chỉ nói "giảm/tăng bao nhiêu" chung chung. Nếu được cung cấp giá trị lần trước thì dùng nó làm mốc cũ.
- Ưu tiên ĐƠN VỊ & TIỀN TỆ Việt Nam (VND/đồng, °C, km, kg, m²...). Nếu nguồn gốc dùng đơn vị/tiền nước ngoài (USD, EUR, °F, dặm, oz, inch...), VẪN nêu số gốc NHƯNG kèm quy đổi/giải thích sang đơn vị Việt trong ngoặc để người Việt dễ hiểu — ví dụ: "2.650 USD/oz (~85 triệu đồng/lượng)", "100°F (~38°C)". NGOẠI LỆ: nếu yêu cầu/điều kiện của người dùng nói rõ muốn dùng đơn vị/tiền nước ngoài thì theo đúng ý họ.`;

// avoidTitles: tiêu đề các bài ĐÃ GỬI trước đó — bảo Gemini né, sửa gốc vòng lặp chết
// "Gemini luôn trả đúng 1 bài nổi nhất → trùng tiêu đề → chặn mãi → toàn filler".
function buildPrompt(rule: Rule, avoidTitles: string[] = []): string {
  const hasCond = Boolean(rule.condition && rule.condition.trim());
  const prev = rule.last_value && rule.last_value.trim() ? rule.last_value.trim() : "";
  const avoid = avoidTitles.length
    ? `\nCÁC BÀI ĐÃ GỬI CHO NGƯỜI DÙNG RỒI (TRÁNH chọn lại các bài này — hãy tìm bài MỚI KHÁC; chỉ được nhắc lại nếu số liệu trong đó ĐÃ THAY ĐỔI):\n${avoidTitles.map((t) => `- ${t}`).join("\n")}\n`
    : "";
  return `Hãy tìm trên web tin tức MỚI NHẤT (trong vài ngày gần đây) về chủ đề: "${rule.keyword}".
${rule.sources ? `Ưu tiên các nguồn: ${rule.sources}.` : ""}
${hasCond ? `Điều kiện người dùng quan tâm: "${rule.condition}".` : "Người dùng muốn nhận tin mới liên quan."}
${prev ? `Số liệu/giá trị GHI NHẬN LẦN TRƯỚC của chủ đề này: "${prev}". Hãy so sánh với giá trị mới tìm được.` : ""}${avoid}
Chọn TỐI ĐA 3 bài MỚI và đáng chú ý nhất (khác nhau, sắp theo mức đáng chú ý GIẢM DẦN). Trả về JSON THUẦN (không markdown) là MẢNG 1-3 phần tử, mỗi phần tử:
{
  "title": "tiêu đề bài báo thật",
  "content": "3-5 câu tóm tắt ĐẦY ĐỦ: chuyện gì xảy ra, số liệu cụ thể. Nếu có thay đổi/biến động: ghi RÕ 'từ [mức cũ] → [mức mới]' (vd 'giảm từ 76 triệu xuống 74,5 triệu đồng/lượng'), không chỉ nói chênh lệch. Đơn vị/tiền tệ ưu tiên kiểu Việt Nam; số liệu nước ngoài thì kèm quy đổi trong ngoặc. Chỉ dùng dữ liệu CÓ THẬT trong bài.",
  "details": "Phân tích chi tiết hơn (3-5 câu): nguyên nhân, diễn biến trước đó, tác động/ý nghĩa, dự báo nếu bài có nêu. Vẫn TUYỆT ĐỐI không bịa số.",
  "ai_summary": "1 câu ngắn ~15 từ chứa điểm mấu chốt; nếu có thay đổi nêu 'từ X → Y'; ưu tiên đơn vị/tiền VN",
  "source": "tên báo (vd: VnExpress)",
  "source_url": "URL bài viết gốc",
  "published_date": "ngày ĐĂNG bài dạng YYYY-MM-DD (vd 2026-06-30). Không rõ ngày thì để chuỗi rỗng \\"\\" — KHÔNG đoán bừa",
  "sentiment": "positive | neutral | negative",
  "is_important": true/false,
  "value": "số liệu chính HIỆN TẠI kèm đơn vị (vd: 75,2 triệu/lượng | 2.650 USD | 27,3 độ C). Nếu chủ đề không có số liệu định lượng thì để chuỗi rỗng \\"\\"",
  "changed": ${prev ? `true nếu "value" mới KHÁC ĐÁNG KỂ so với "${prev}" (đổi giá/đổi mức theo hướng người dùng quan tâm), false nếu gần như không đổi` : "true"},
  "matches_condition": ${hasCond ? `true nếu bài THẬT SỰ cho thấy điều kiện "${rule.condition}" đã xảy ra (xét cả mức thay đổi so với lần trước nếu điều kiện nói về tăng/giảm), ngược lại false` : "true"}
}
QUAN TRỌNG: Nếu KHÔNG có bài khớp hoàn toàn yêu cầu/điều kiện, VẪN trả về bài LIÊN QUAN nhất và MỚI NHẤT (ngày phát hành gần nhất) tìm được, và đặt "matches_condition": false (đừng tự ý đặt true). Chỉ trả về mảng rỗng [] khi hoàn toàn không có bất kỳ thông tin nào về chủ đề. Chỉ trả JSON, không giải thích.`;
}

function normSentiment(v: unknown): string {
  const s = String(v ?? "").toLowerCase();
  if (s.includes("pos")) return "positive";
  if (s.includes("neg")) return "negative";
  return "neutral";
}

function toBool(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  const s = String(v ?? "").toLowerCase();
  return s === "true" || s === "yes" || s === "high" || s === "1";
}

function isUrl(s: unknown): boolean {
  return typeof s === "string" && /^https?:\/\//i.test(s);
}

// Gửi push qua Expo Push API tới mọi thiết bị của user (nếu có token).
// deno-lint-ignore no-explicit-any
async function sendPush(
  supabase: any,
  userId: string | undefined,
  title: string,
  body: string,
  notificationId: string,
) {
  if (!userId) return;

  // Giờ yên lặng: trong khung người dùng đặt → KHÔNG đẩy push (thông báo vẫn đã lưu, xem trong app).
  const { data: settings } = await supabase
    .from("user_settings")
    .select("quiet_enabled, quiet_start, quiet_end")
    .eq("user_id", userId)
    .maybeSingle();
  if (settings?.quiet_enabled && isQuietNow(settings.quiet_start, settings.quiet_end, vnHourNow())) return;

  const { data: toks } = await supabase
    .from("push_tokens")
    .select("token")
    .eq("user_id", userId);
  const tokens = (toks ?? []).map((t: { token: string }) => t.token).filter(Boolean);
  if (tokens.length === 0) return;

  const messages = tokens.map((to: string) => ({
    to,
    sound: "default",
    title: title.slice(0, 150) || "Tin mới",
    body: body.slice(0, 300),
    data: { notificationId },
  }));

  try {
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(messages),
    });
    // DỌN TOKEN CHẾT: Expo trả ticket theo đúng thứ tự messages. Token đã gỡ app /
    // hết hạn báo DeviceNotRegistered — giữ lại chỉ tổ bắn mãi vào hư không, nên xóa.
    const out = await res.json().catch(() => null) as
      { data?: { status?: string; details?: { error?: string } }[] } | null;
    const tickets = out?.data ?? [];
    const dead = tokens.filter((_: string, i: number) =>
      tickets[i]?.status === "error" && tickets[i]?.details?.error === "DeviceNotRegistered"
    );
    if (dead.length > 0) {
      await supabase.from("push_tokens").delete().in("token", dead);
      console.log(`Đã xóa ${dead.length} push token chết (DeviceNotRegistered).`);
    }
  } catch (e) {
    console.log("Push send lỗi:", (e as Error).message);
  }
}

// Loại tin tạo ra trong 1 lần quét — để trang test hiểu rule cho ra cái gì.
type NotifKind =
  | "real"      // tin thật, vượt mọi cổng (điều kiện/thay đổi/chống trùng)
  | "nochange"  // fallback: chưa có thay đổi so với tb trước
  | "related"   // fallback: chưa đúng yêu cầu, gợi ý tin liên quan
  | "none"      // fallback: hoàn toàn không tìm thấy gì
  | "skipped";  // không tạo tb (điều kiện chưa thỏa / đã có tb trong chu kỳ)

interface MonitorRuleResult {
  inserted: number;
  value?: string; // số liệu mới để lưu làm baseline cho lần sau
  contentHash?: string; // vân tay trang (rule url) → lưu rules.last_content_hash
  note?: { title: string; kind: NotifKind };
}

interface NotifFields {
  title: string;
  content: string;
  details: string;
  ai_summary: string;
  source: string;
  source_url: string;
  sentiment: string;
  is_important: boolean;
  related_notification_id?: string; // trỏ tới thông báo trước (khi không có URL bài gốc)
}

// Chèn 1 notification + (tùy) đẩy push. Trả 1 nếu thành công, 0 nếu lỗi.
// push=false → chỉ lưu trong app, KHÔNG đẩy push. Dùng cho FILLER ("chưa có thay đổi"/
// "chưa tìm thấy"/gợi ý liên quan): tin trạng thái này gần như không có giá trị để rung máy,
// nên mặc định không push (giảm "thông báo rác") — vẫn xem được trong app để biết hệ thống chạy.
// deno-lint-ignore no-explicit-any
async function insertNotif(supabase: any, rule: Rule, f: NotifFields, push = true): Promise<number> {
  const title = (f.title || "Tin mới").slice(0, 300);
  // deno-lint-ignore no-explicit-any
  const row: Record<string, any> = {
    rule_id: rule.id,
    user_id: rule.user_id, // chủ sở hữu trực tiếp (0021) — thông báo sống sót khi rule bị xóa
    title,
    content: f.content ?? "",
    details: f.details ?? "",
    ai_summary: f.ai_summary ?? "",
    source: f.source || "Web",
    source_url: f.source_url ?? "",
    category: rule.category ?? "news",
    sentiment: f.sentiment || "neutral",
    is_important: Boolean(f.is_important),
    is_read: false,
  };
  // Chỉ set khi có (tránh tham chiếu cột nếu migration 0009 chưa chạy).
  if (f.related_notification_id) row.related_notification_id = f.related_notification_id;
  let { data: ins, error } = await supabase.from("notifications")
    .insert([row]).select("id").single();
  if (error) {
    // Cột user_id chưa có (0021 chưa chạy) → ghi lại không kèm, tuyệt đối không mất thông báo.
    delete row.user_id;
    ({ data: ins, error } = await supabase.from("notifications").insert([row]).select("id").single());
  }
  if (error || !ins) return 0;
  // Rule "để êm" (muted) HOẶC filler (push=false): vẫn lưu để xem trong app, KHÔNG đẩy push.
  if (!rule.muted && push) {
    await sendPush(supabase, rule.user_id, title, f.ai_summary || f.content || "", ins.id);
  }
  return 1;
}

// Ghi log 1 lần gọi Gemini (theo dõi quota). Best-effort: bảng có thể chưa tạo → nuốt lỗi.
// deno-lint-ignore no-explicit-any
async function logUsage(supabase: any, ruleId: string, ok: boolean, error?: string, model?: string) {
  try {
    const row = { kind: "gemini", rule_id: ruleId, ok, error: error ?? null };
    const { error: e1 } = await supabase.from("usage_logs").insert({ ...row, model: model ?? null });
    if (e1) await supabase.from("usage_logs").insert(row); // cột model chưa có (0024 chưa chạy)
  } catch { /* bảng usage_logs chưa có → bỏ qua */ }
}

// Ghi log 1 lần run-monitor chạy (sức khỏe cron). Best-effort.
// detail = tên các rule đã quét (cột detail có thể chưa tạo → tự bỏ qua, vẫn ghi phần còn lại).
// deno-lint-ignore no-explicit-any
async function logCronRun(
  supabase: any,
  trigger: string,
  rulesScanned: number,
  inserted: number,
  quotaHit: boolean,
  durationMs: number,
  detail?: string,
) {
  const base = {
    trigger,
    rules_scanned: rulesScanned,
    inserted,
    quota_hit: quotaHit,
    duration_ms: durationMs,
  };
  try {
    const { error } = await supabase.from("cron_runs").insert({ ...base, detail: detail ?? null });
    // Cột detail chưa tồn tại → ghi lại bản không có detail để KHÔNG mất log.
    if (error) await supabase.from("cron_runs").insert(base);
  } catch { /* bảng cron_runs chưa có → bỏ qua */ }
}

// ---- CẢNH BÁO QUOTA (chủ động, khỏi phải mở trang admin xem) ----
const QUOTA_LIMIT = 1500;      // trần grounding free tier / ngày
const QUOTA_ALERT_AT = 1200;   // ~80% → báo sớm để kịp giãn nhịp / tắt bớt rule

// Ngày (YYYY-MM-DD) theo giờ Thái Bình Dương — mốc reset quota Gemini (giống admin-api).
function pacificDay(ms: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(ms));
}

// Đẩy push cho admin ĐÚNG LÚC quota vượt ngưỡng (trước run còn dưới, sau run chạm) →
// mỗi ngày tối đa 1 lần, không spam. Best-effort: lỗi gì cũng nuốt, không ảnh hưởng quét.
// deno-lint-ignore no-explicit-any
async function maybeAlertQuota(supabase: any, callsThisRun: number) {
  try {
    if (callsThisRun <= 0) return;
    const since = new Date(Date.now() - 26 * 3600000).toISOString();
    const { data } = await supabase.from("usage_logs").select("created_at").gte("created_at", since);
    const today = pacificDay(Date.now());
    const total = (data ?? [])
      .filter((r: { created_at: string }) => pacificDay(Date.parse(r.created_at)) === today).length;
    if (total < QUOTA_ALERT_AT || total - callsThisRun >= QUOTA_ALERT_AT) return; // chưa chạm / đã báo run trước
    const adminEmails = (Deno.env.get("ADMIN_EMAILS") ?? "")
      .toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);
    if (adminEmails.length === 0) return;
    const { data: usersList } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    for (const u of usersList?.users ?? []) {
      if (u.email && adminEmails.includes(u.email.toLowerCase())) {
        await sendPush(
          supabase, u.id,
          "⚠️ Quota Gemini sắp hết",
          `Hôm nay đã dùng ${total}/${QUOTA_LIMIT} lượt (ngưỡng cảnh báo ${QUOTA_ALERT_AT}). Cân nhắc giãn nhịp hoặc tạm dừng bớt rule.`,
          "",
        );
      }
    }
  } catch { /* usage_logs chưa có / lỗi phụ → bỏ qua */ }
}

// ---- ROUTER PROVIDER (Pha A+B): nguồn dữ liệu chuyên biệt, 0 quota grounding ----

// Lấy bản tin từ provider tương ứng. THROW nếu lỗi → caller fallback về search.
function fetchProviderNotif(rule: Rule, srcType: SourceType): Promise<ProviderNotif> {
  if (srcType === "weather") return fetchWeatherNotif(rule.keyword);
  if (srcType === "crypto") return fetchCryptoNotif(rule.keyword);
  return fetchFxNotif(rule.last_value);
}

// Chấm điều kiện tự do ("khi giá vượt 80 triệu"...) trên SỐ THẬT từ provider bằng
// flash-lite (KHÔNG grounding → không đụng quota 1.500; rẻ). Lỗi → throw → fallback search.
// deno-lint-ignore no-explicit-any
async function evalConditionAI(supabase: any, rule: Rule, currentValue: string): Promise<boolean> {
  try {
    const { text, model: usedModel } = await geminiGenerate({
      system: "Bạn đánh giá điều kiện số liệu. Chỉ trả JSON thuần, không giải thích.",
      user: `Điều kiện người dùng: "${rule.condition}".\nGiá trị HIỆN TẠI (số liệu thật từ API): "${currentValue}".\nGiá trị lần trước: "${rule.last_value?.trim() || "chưa có"}".\nĐiều kiện đã THỎA chưa? Trả JSON: {"matches": true/false}`,
      json: true,
      temperature: 0,
      model: "gemini-2.5-flash-lite",
      fallbackModels: CHEAP_FALLBACK, // lite free chỉ còn 20 lượt/ngày (2026-07)
    });
    await logUsage(supabase, rule.id, true, undefined, usedModel);
    const d = parseJsonLoose<{ matches?: unknown }>(text);
    return toBool(d?.matches);
  } catch (e) {
    await logUsage(supabase, rule.id, false, (e as Error).message);
    throw e;
  }
}

// Quét 1 rule bằng PROVIDER: dữ liệu chính xác từ API thật, bản tin dựng bằng template
// (rule không điều kiện thì 0 call AI). Cổng gửi:
//  - có condition  → chỉ gửi khi AI chấm THỎA trên số thật; chống lặp trigger bằng
//                    cooldown 6h + bỏ cooldown nếu biến động ≥3%.
//  - đặt giờ       → luôn gửi bản tin (lịch hẹn).
//  - định kỳ thường→ gửi mỗi kỳ; nếu rule ở chế độ "chỉ tin quan trọng" thì chỉ gửi khi
//                    số liệu đổi ≥1% so với lần trước.
// deno-lint-ignore no-explicit-any
async function monitorProvider(supabase: any, rule: Rule, srcType: SourceType): Promise<MonitorRuleResult> {
  const p = await fetchProviderNotif(rule, srcType);
  const hasCond = Boolean(rule.condition && rule.condition.trim());
  const scheduled = isScheduled(rule);
  const skipped: MonitorRuleResult = { inserted: 0, value: p.value, note: { title: "", kind: "skipped" } };

  if (hasCond) {
    const matches = await evalConditionAI(supabase, rule, p.value);
    if (!matches) return skipped; // chưa thỏa → im (baseline vẫn cập nhật theo value trả về)
    // Điều kiện vẫn đang thỏa liên tục → không bắn lại mỗi lượt quét: cooldown 6h,
    // trừ khi biến động ≥3% so với lần trước (tin lớn thì không đợi).
    const { data: prevRows } = await supabase
      .from("notifications").select("created_at").eq("rule_id", rule.id)
      .order("created_at", { ascending: false }).limit(1);
    const prevMs = prevRows?.[0]?.created_at ? Date.parse(prevRows[0].created_at) : 0;
    const recentAlert = prevMs > Date.now() - 6 * 3600000;
    if (recentAlert && !significantChange(rule.last_value, p.value, 3)) return skipped;
  } else if (!scheduled && rule.notify_mode === "important") {
    // Định kỳ thường + chế độ "chỉ tin quan trọng": số liệu gần như đứng yên thì im.
    if (!significantChange(rule.last_value, p.value, 1)) return skipped;
  }

  const inserted = await insertNotif(supabase, rule, {
    title: p.title,
    content: p.content,
    details: p.details,
    ai_summary: p.ai_summary,
    source: p.source,
    source_url: p.source_url,
    sentiment: "neutral",
    is_important: hasCond, // chạm điều kiện người dùng đặt = tin quan trọng
  });
  return { inserted, value: p.value, note: { title: p.title, kind: "real" } };
}

// ---- THEO DÕI TRANG WEB CỤ THỂ (Pha E): fetch URL người dùng đưa, AI trích giá trị ----

// URL của rule: cột watch_url (tường minh) hoặc URL nằm ngay trong keyword (rule cũ/gõ tay).
// Quy đổi link MXH dạng "thường" sang link đọc được (t.me/s/, reddit .rss, bsky /rss,
// youtube channel → feed) — người dùng dán link nào quen tay cũng chạy.
function ruleWatchUrl(rule: Rule): string {
  const raw = (rule.watch_url ?? "").trim() || extractWatchUrl(rule.keyword);
  return raw ? normalizeWatchUrl(raw) : "";
}

interface UrlExtract {
  found: boolean;           // trang có chứa thông tin người dùng cần không
  login_required: boolean;  // trang đang đòi đăng nhập (nội dung chính bị che)
  title: string;
  value: string;            // giá trị chính trích được (máy-đọc, để so lần sau)
  content: string;
  details: string;          // phân tích/bối cảnh thêm từ trang (có thể rỗng)
  ai_summary: string;
  changed: boolean;         // khác đáng kể so với giá trị lần trước?
  matches_condition: boolean;
  is_important: boolean;
  link_index: number;       // link bài viết khớp thông tin (trong danh sách đưa vào); -1 = không có
}

// flash-lite ĐỌC text trang đã strip HTML → trích đúng thông tin rule cần (KHÔNG grounding,
// không đụng quota 1.500). links = link bài trên trang để AI CHỌN (thông báo trỏ đúng bài
// thay vì trang chủ — quan trọng với trang tin tức). Lỗi → throw để caller xử lý.
// deno-lint-ignore no-explicit-any
async function extractUrlAI(supabase: any, rule: Rule, page: WatchPage, links: PageLink[] = [], avoidTitles: string[] = []): Promise<UrlExtract> {
  const hasCond = Boolean(rule.condition && rule.condition.trim());
  const prev = rule.last_value?.trim() ?? "";
  const linkList = links.length
    ? `\nCÁC LINK BÀI VIẾT TRÊN TRANG (đánh số):\n${links.map((l, i) => `[${i}] ${l.text}`).join("\n")}\n`
    : "";
  // Bản tin đã gửi các lần trước: có tin MỚI → nêu điểm mới + đặt title KHÁC; trang
  // vẫn y như cũ → GIỮ NGUYÊN title cũ (đừng diễn đạt lại cho khác đi — cổng chống
  // trùng so tiêu đề; sửa gốc vụ "rule đặt giờ mấy hôm liền gửi cùng 1 thông báo").
  const avoid = avoidTitles.length
    ? `\nCÁC BẢN TIN ĐÃ GỬI CHO NGƯỜI DÙNG RỒI (mới nhất trước):\n${avoidTitles.map((t) => `- ${t}`).join("\n")}\nNếu trang CÓ thông tin mới so với các bản tin trên → tập trung vào điểm MỚI và đặt "title" KHÁC hẳn các tiêu đề trên. Nếu trang KHÔNG có gì mới hơn → đặt "title" GIỐNG HỆT tiêu đề gần nhất ở trên và "changed": false (TUYỆT ĐỐI không diễn đạt lại tiêu đề cũ cho khác đi).\n`
    : "";
  try {
    const { text, model: usedModel } = await geminiGenerate({
      system:
        "Bạn đọc nội dung TEXT của một trang web và trích đúng thông tin người dùng đang theo dõi. TUYỆT ĐỐI không bịa thông tin không có trong text. Chỉ trả JSON thuần.",
      user: `Người dùng theo dõi trang: ${page.finalUrl}
Điều họ quan tâm: "${rule.keyword}"${rule.description ? ` (${rule.description})` : ""}.
${hasCond ? `Điều kiện để báo: "${rule.condition}".` : ""}
${prev ? `Giá trị ghi nhận LẦN TRƯỚC: "${prev}".` : ""}
QUY TẮC TRANG DANH SÁCH: nếu trang là DANH SÁCH/BẢNG XẾP HẠNG nhiều mục (trending, top, kết quả...) và người dùng muốn biết "những mục nào" — "content" PHẢI LIỆT KÊ CỤ THỂ 5-8 mục nổi bật nhất, mỗi mục 1 dòng dạng "• Tên — [nó LÀ GÌ / DÙNG ĐỂ LÀM GÌ: 1 câu tiếng Việt dịch từ mô tả trên trang] (số liệu nếu có, vd ⭐ 12.300)". Người đọc KHÔNG biết các tên trong danh sách — chỉ liệt kê tên mà không giải thích công dụng là VÔ DỤNG; mô tả tiếng Anh phải DỊCH sang tiếng Việt; mục nào trang không ghi mô tả thì chú "(trang không mô tả)", không được bịa. Khi đó "details" KHÔNG lặp lại danh sách mà rút ra xu hướng chung (vd "4/7 dự án hôm nay xoay quanh AI agent; X tăng sao nhanh nhất..."); "title" nêu đích danh 1-2 cái tên dẫn đầu. TUYỆT ĐỐI không tóm tắt chung chung kiểu "trang có nhiều dự án đáng chú ý".

NỘI DUNG TRANG (đã bỏ HTML):
"""
${page.text.slice(0, 12000)}
"""
${linkList}${avoid}
Trả JSON:
{
  "found": true nếu trang CÓ thông tin người dùng cần, false nếu không thấy,
  "login_required": true CHỈ KHI nội dung chính KHÔNG XEM ĐƯỢC vì trang bắt đăng nhập/paywall (gần như chỉ thấy form login, "vui lòng đăng nhập"...). Trang CÔNG KHAI có nút "Đăng nhập/Sign in" trên menu nhưng nội dung vẫn đọc được bình thường → false,
  "title": "tiêu đề ngắn cho thông báo, nêu thông tin chính (vd 'Đơn hàng #123: Đang giao')",
  "value": "giá trị chính trích được, ngắn gọn máy-đọc (vd '1.250.000 đ' | 'Đang giao' | 'Chương 105'). \\"\\" nếu không có",
  "content": "4-6 câu tóm tắt ĐẦY ĐỦ thông tin tìm được trên trang, số liệu cụ thể, tiếng Việt${prev ? "; nếu có thay đổi nêu RÕ 'từ [cũ] → [mới]'" : ""}",
  "details": "2-4 câu phân tích/bối cảnh thêm rút từ trang (nguyên nhân, diễn biến, so sánh...) — KHÔNG bịa; để \\"\\" nếu trang không có gì thêm",
  "ai_summary": "1 câu ngắn ~15 từ điểm mấu chốt",
  "changed": ${prev ? `true nếu "value" mới KHÁC đáng kể so với "${prev}", false nếu gần như không đổi` : "true"},
  "matches_condition": ${hasCond ? `true nếu nội dung trang cho thấy điều kiện "${rule.condition}" đã xảy ra, ngược lại false` : "true"},
  "is_important": true nếu thông tin này đáng chú ý với người theo dõi, ngược lại false${links.length ? `,
  "link_index": số thứ tự link bài viết KHỚP với thông tin bạn trích (0-${links.length - 1}), hoặc -1 nếu thông tin không thuộc bài cụ thể nào` : ""}
}`,
      json: true,
      temperature: 0.2,
      model: "gemini-2.5-flash-lite",
      fallbackModels: CHEAP_FALLBACK, // lite free chỉ còn 20 lượt/ngày (2026-07)
    });
    await logUsage(supabase, rule.id, true, undefined, usedModel);
    const d = parseJsonLoose<Partial<UrlExtract>>(text);
    return {
      found: toBool(d?.found),
      login_required: toBool(d?.login_required),
      title: String(d?.title ?? ""),
      value: String(d?.value ?? ""),
      content: String(d?.content ?? ""),
      details: String(d?.details ?? ""),
      ai_summary: String(d?.ai_summary ?? ""),
      changed: toBool(d?.changed),
      matches_condition: toBool(d?.matches_condition),
      is_important: toBool(d?.is_important),
      link_index: Number.isFinite(Number(d?.link_index)) ? Number(d?.link_index) : -1,
    };
  } catch (e) {
    await logUsage(supabase, rule.id, false, (e as Error).message);
    throw e;
  }
}

// Thông báo "cần cấp quyền đăng nhập" — gửi 1 lần (không lặp lại khi thông báo gần nhất
// của rule vẫn là chính nó), kèm hướng dẫn dán Cookie trong chi tiết rule.
// deno-lint-ignore no-explicit-any
async function notifyLoginNeeded(supabase: any, rule: Rule, host: string, expired: boolean): Promise<MonitorRuleResult> {
  const title = expired ? `🔒 Quyền đăng nhập hết hạn: ${host}` : `🔒 Trang cần đăng nhập: ${host}`;
  const { data: prevRows } = await supabase
    .from("notifications").select("title").eq("rule_id", rule.id)
    .order("created_at", { ascending: false }).limit(1);
  if (String(prevRows?.[0]?.title ?? "") === title) {
    return { inserted: 0, note: { title: "", kind: "skipped" } }; // đã nhắc rồi, đừng spam
  }
  const inserted = await insertNotif(supabase, rule, {
    title,
    content: expired
      ? `Cookie/token bạn cấp cho ${host} không còn hiệu lực nên không đọc được nội dung. Mở chi tiết rule → mục "Cấp quyền đăng nhập" và dán Cookie mới (lấy từ trình duyệt sau khi đăng nhập lại).`
      : `Trang ${host} yêu cầu đăng nhập nên chưa theo dõi được. Mở chi tiết rule → mục "Cấp quyền đăng nhập" và dán Cookie của bạn (đăng nhập trang đó trên trình duyệt → F12 → tab Network → copy giá trị header Cookie). Cookie chỉ mình bạn và hệ thống quét đọc được.`,
    details: "",
    ai_summary: expired ? `Cần cấp lại quyền đăng nhập cho ${host}.` : `Cần cấp quyền đăng nhập cho ${host}.`,
    source: host,
    source_url: ruleWatchUrl(rule),
    sentiment: "neutral",
    is_important: true, // không cấp quyền thì rule tê liệt → đáng push
  });
  return { inserted, note: { title, kind: "real" } };
}

// Cổng gửi dùng chung cho 2 đường của rule url (feed / đọc trang).
interface UrlGates {
  hasCond: boolean;
  scheduled: boolean;
  importantOnly: boolean;
  changeGate: boolean;
}

// LÀM GIÀU NỘI DUNG: fetch BÀI GỐC rồi để flash-lite viết bản tin đầy đủ (content 4-6 câu
// + details phân tích + ai_summary) từ TEXT THẬT của bài — thay vì tóm 2 dòng từ mô tả
// feed vốn rất ngắn (nguyên nhân thông báo "sơ sài"). Best-effort: bài không fetch được /
// AI lỗi → trả null, caller giữ bản tóm tắt từ mô tả như cũ.
interface RichNotif {
  content: string;
  details: string;
  ai_summary: string;
}

// deno-lint-ignore no-explicit-any
async function enrichFromArticle(
  supabase: any,
  rule: Rule,
  articleUrl: string,
  title: string,
): Promise<RichNotif | null> {
  try {
    if (!isWatchableUrl(articleUrl)) return null;
    const page = await fetchWatchPage(articleUrl);
    if (page.status >= 400 || page.text.length < 300) return null; // trang chặn/quá nghèo
    const { text, model: usedModel } = await geminiGenerate({
      system:
        "Bạn viết bản tin tiếng Việt từ nội dung bài viết cho trước. TUYỆT ĐỐI không bịa thông tin/số liệu ngoài bài. Chỉ trả JSON thuần.",
      user: `Người dùng theo dõi: "${rule.keyword}"${rule.condition?.trim() ? ` (điều kiện quan tâm: ${rule.condition})` : ""}.
Bài viết: "${title}"
NỘI DUNG BÀI (đã bỏ HTML):
"""
${page.text.slice(0, 9000)}
"""
Trả JSON:
{
  "content": "4-6 câu tóm tắt ĐẦY ĐỦ: chuyện gì xảy ra, số liệu cụ thể trong bài; có thay đổi/biến động thì nêu rõ 'từ [mức cũ] → [mức mới]'; ưu tiên đơn vị/tiền tệ Việt Nam",
  "details": "3-5 câu PHÂN TÍCH thêm từ bài: nguyên nhân, bối cảnh, tác động, dự báo nếu bài có nêu (không bịa)",
  "ai_summary": "1 câu ~15 từ điểm mấu chốt"
}`,
      json: true,
      temperature: 0.2,
      model: "gemini-2.5-flash-lite",
      fallbackModels: CHEAP_FALLBACK, // lite free chỉ còn 20 lượt/ngày (2026-07)
    });
    await logUsage(supabase, rule.id, true, undefined, usedModel);
    const d = parseJsonLoose<Partial<RichNotif>>(text);
    const content = String(d?.content ?? "").trim();
    if (!content) return null;
    return {
      content,
      details: String(d?.details ?? "").trim(),
      ai_summary: String(d?.ai_summary ?? "").trim(),
    };
  } catch {
    return null; // enrich chỉ là cộng thêm — lỗi gì cũng không được làm hỏng thông báo
  }
}

// Xử lý danh sách bài từ FEED cho rule url (dùng chung: feed trang khai báo + watch_url
// là feed trực tiếp). Trả null = không có bài mới liên quan → caller quyết định tiếp.
// deno-lint-ignore no-explicit-any
async function monitorFeedItems(
  supabase: any,
  rule: Rule,
  items: RssItem[],
  seenTitles: Set<string>,
  seenLinks: Set<string>,
  g: UrlGates,
): Promise<MonitorRuleResult | null> {
  if (items.length === 0) return null;

  // Chống trùng 2 lớp: tiêu đề + LINK chuẩn hóa (báo sửa tít nhẹ thì link vẫn bắt được).
  const unseen = items
    .filter((it) => {
      if (seenTitles.has(normTitle(it.title))) return false;
      const l = normLink(it.link);
      return !l || !seenLinks.has(l);
    })
    .slice(0, 25);
  if (unseen.length === 0) return null; // feed không có bài mới → vẫn thử đọc trang

  let pick: RssPick;
  try {
    pick = await pickRssItemAI(supabase, rule, unseen);
  } catch {
    return null;
  }
  const chosen = pick.index >= 0 ? unseen[pick.index] : undefined;
  if (!chosen) return null; // bài mới nhưng không liên quan chủ đề → đọc trang như thường

  const value = pick.value.trim() ? pick.value.trim().slice(0, 200) : undefined;
  const condOk = !g.hasCond || pick.matches_condition;
  const changeOk = !g.changeGate || pick.changed;
  const importantOk = !g.importantOnly || pick.is_important || (g.hasCond && pick.matches_condition);
  if (!condOk || !changeOk || !importantOk) {
    // Có bài liên quan nhưng chưa vượt cổng → lượt này xong (đọc trang cũng cùng nội dung thôi).
    return { inserted: 0, value, note: { title: "", kind: "skipped" } };
  }

  // Đọc BÀI GỐC để viết bản tin đầy đủ + phân tích (mô tả feed quá ngắn → sơ sài).
  const rich = await enrichFromArticle(supabase, rule, chosen.link, chosen.title);
  const inserted = await insertNotif(supabase, rule, {
    title: chosen.title,
    content: rich?.content || pick.content || chosen.description,
    details: rich?.details ?? "",
    ai_summary: rich?.ai_summary || pick.ai_summary,
    source: sourceFromLink(chosen.link),
    source_url: chosen.link, // link BÀI THẬT từ feed
    sentiment: normSentiment(pick.sentiment),
    is_important: g.hasCond ? true : pick.is_important,
  });
  return { inserted, value, note: { title: chosen.title, kind: "real" } };
}

// ĐƯỜNG FEED cho rule url (trang tin tức/blog): trang tự khai báo RSS trong <head>
// (Tuổi Trẻ, CafeF, WordPress, Bluesky, GitHub...) → đọc feed thay vì bóc HTML.
// Trả null = không dùng được feed → caller đọc HTML như thường.
// deno-lint-ignore no-explicit-any
async function monitorUrlViaFeed(
  supabase: any,
  rule: Rule,
  page: WatchPage,
  seenTitles: Set<string>,
  seenLinks: Set<string>,
  g: UrlGates,
): Promise<MonitorRuleResult | null> {
  const feedUrl = discoverFeedUrl(page.html, page.finalUrl);
  if (!feedUrl || !isWatchableUrl(feedUrl)) return null;

  let items: RssItem[];
  try {
    const res = await fetch(feedUrl, {
      headers: { "Accept": "application/rss+xml, application/xml, text/xml" },
    });
    if (!res.ok) return null;
    items = parseRss(await res.text());
  } catch {
    return null;
  }
  return await monitorFeedItems(supabase, rule, items, seenTitles, seenLinks, g);
}

// Quét 1 rule THEO DÕI TRANG WEB: fetch URL (kèm quyền đăng nhập nếu người dùng đã cấp)
// → ưu tiên FEED trang khai báo (tin tức) → không thì flash-lite đọc HTML. Cổng gửi:
//  - có condition   → chỉ gửi khi thỏa; chống lặp = cooldown 6h + bỏ cooldown khi đổi ≥3%.
//  - đặt giờ        → luôn gửi bản tin.
//  - định kỳ thường → chỉ gửi khi có NỘI DUNG MỚI (bài chưa gửi / giá trị đổi) — đọc lại
//                     trang mà y nguyên thì im, khỏi spam cùng 1 bài.
// deno-lint-ignore no-explicit-any
async function monitorUrl(supabase: any, rule: Rule, manual = false): Promise<MonitorRuleResult> {
  const url = ruleWatchUrl(rule);
  if (!url) throw new Error("Rule url không có watch_url");
  const host = new URL(url).hostname;
  const hasAuth = Boolean(rule.watch_auth && rule.watch_auth.trim());

  const page = await fetchWatchPage(url, rule.watch_auth);

  // Trang đòi đăng nhập rõ ràng (HTTP 401/403) → nhắc người dùng cấp/cấp lại quyền.
  if (page.status === 401 || page.status === 403) {
    return await notifyLoginNeeded(supabase, rule, host, hasAuth);
  }
  if (page.status >= 400) throw new Error(`Trang trả HTTP ${page.status}`);
  if (!page.text.trim()) throw new Error("Trang không có nội dung đọc được");

  // HASH-GATE: trang Y NGUYÊN lần trước (vân tay trùng) → chẳng thể có gì mới, skip
  // ngay 0 call AI. KHÔNG áp khi: quét manual ("Kiểm tra tin ngay" — người dùng chủ
  // động bấm thì soi thật) hoặc rule ghim giờ (bản tin đúng hẹn phải giao dù trang y nguyên).
  const fp = contentFingerprint(page.text);
  const withHash = (r: MonitorRuleResult): MonitorRuleResult => ({ ...r, contentHash: fp });
  if (!manual && !isScheduled(rule) && Boolean(rule.last_content_hash) && rule.last_content_hash === fp) {
    return withHash({ inserted: 0, note: { title: "", kind: "skipped" } });
  }

  const hasCond = Boolean(rule.condition && rule.condition.trim());
  const scheduled = isScheduled(rule);
  const importantOnly = rule.notify_mode === "important" && !scheduled;
  const changeGate = rule.frequency === "change" && Boolean(rule.last_value && rule.last_value.trim());
  const gates: UrlGates = { hasCond, scheduled, importantOnly, changeGate };
  const prevNorm = normVal(String(rule.last_value ?? ""));

  // Tiêu đề + link đã gửi — chống báo lại cùng 1 bài (giữa 2 bài mới, đọc lại trang vẫn thấy bài cũ).
  const { data: existing } = await supabase
    .from("notifications").select("id, title, source_url").eq("rule_id", rule.id)
    .order("created_at", { ascending: false }).limit(60);
  const seenTitles = new Set<string>(
    (existing ?? []).map((n: { title: string }) => normTitle(String(n.title ?? ""))).filter(Boolean),
  );
  const seenLinks = new Set<string>(
    (existing ?? []).map((n: { source_url?: string }) => normLink(String(n.source_url ?? ""))).filter(Boolean),
  );

  // watch_url là FEED TRỰC TIẾP (reddit .rss / youtube feeds/videos.xml / github .atom —
  // người dùng dán thẳng hoặc normalizeWatchUrl quy đổi) → xử lý dạng feed, khỏi bóc HTML.
  if (looksLikeFeed(page.html)) {
    const items = parseRss(page.html);
    if (items.length > 0) {
      const viaSelf = await monitorFeedItems(supabase, rule, items, seenTitles, seenLinks, gates);
      // Feed là TOÀN BỘ nội dung nguồn: không bài mới/liên quan → im, chờ lượt sau.
      return withHash(viaSelf ?? { inserted: 0, note: { title: "", kind: "skipped" } });
    }
  }

  // ƯU TIÊN FEED trang tự khai báo (tin tức/blog) — link bài thật, dedup chuẩn.
  const viaFeed = await monitorUrlViaFeed(supabase, rule, page, seenTitles, seenLinks, gates);
  if (viaFeed) return withHash(viaFeed);

  // ĐỌC TRANG: kèm danh sách link bài để AI chọn — thông báo trỏ đúng BÀI thay vì trang chủ.
  const links = extractPageLinks(page.html, page.finalUrl);
  const avoidTitles = recentRealTitles((existing ?? []).map((n: { title: string }) => n.title));
  const ex = await extractUrlAI(supabase, rule, page, links, avoidTitles);

  // Nhiều trang trả 200 nhưng nội dung chính bị che sau form login → AI phát hiện.
  // CHỐT CHẶN chống hỏi quyền oan: trang có NHIỀU text đọc được (>6000 ký tự) gần như
  // chắc chắn là trang công khai (nút "Đăng nhập" trên menu làm AI nhận nhầm) → không hỏi.
  if (ex.login_required && !ex.found && page.text.length < 6000) {
    return withHash(await notifyLoginNeeded(supabase, rule, host, hasAuth));
  }

  const skipped: MonitorRuleResult = {
    inserted: 0,
    value: ex.value.trim() ? ex.value.trim().slice(0, 200) : undefined,
    contentHash: fp,
    note: { title: "", kind: "skipped" },
  };
  if (!ex.found) return skipped; // trang không có thông tin cần — im, chờ lượt sau

  const curNorm = normVal(ex.value);
  // "Thực sự đổi": lần đầu (chưa có mốc) = đổi; còn lại tin AI + so sánh giá trị chuẩn hóa.
  const reallyChanged = prevNorm === "" || (curNorm !== "" && curNorm !== prevNorm) || ex.changed;
  const title = ex.title.trim() || `Cập nhật từ ${host}`;
  // CHỐNG TRÙNG: tiêu đề đã gửi + giá trị không đổi = nội dung y nguyên lần trước → im.
  const fresh = !seenTitles.has(normTitle(title)) || (curNorm !== "" && curNorm !== prevNorm);
  if (!fresh) {
    if (!scheduled) return skipped;
    // Rule ĐẶT GIỜ vẫn phải giao bản tin đúng hẹn, nhưng gửi lại NGUYÊN VĂN bản cũ thì
    // thành "mấy hôm liền cùng 1 thông báo" (vd GitHub trending giữ nguyên top vài ngày).
    // → thay bằng bản tin "chưa có thay đổi" trỏ về thông báo THẬT gần nhất (vẫn push).
    const prevReal = (existing ?? []).find(
      (n: { id?: string; title?: string }) => !isFillerTitle(String(n.title ?? "")),
    );
    const topic = (rule.keyword || rule.title || "trang theo dõi").slice(0, 60);
    const ncTitle = `Chưa có thay đổi mới: ${topic}`;
    const inserted = await insertNotif(supabase, rule, {
      title: ncTitle,
      content: `Trang chưa có nội dung mới so với bản tin trước ("${title.slice(0, 120)}"). Bạn có thể xem lại thông báo gần nhất bên dưới.`,
      details: "",
      ai_summary: "Chưa có thay đổi so với bản tin trước.",
      source: host,
      source_url: "",
      related_notification_id: prevReal?.id,
      sentiment: "neutral",
      is_important: false,
    });
    return { inserted, value: skipped.value, contentHash: fp, note: { title: ncTitle, kind: "nochange" } };
  }

  if (hasCond) {
    if (!ex.matches_condition) return skipped;
    const { data: prevRows } = await supabase
      .from("notifications").select("created_at").eq("rule_id", rule.id)
      .order("created_at", { ascending: false }).limit(1);
    const prevMs = prevRows?.[0]?.created_at ? Date.parse(prevRows[0].created_at) : 0;
    const recentAlert = prevMs > Date.now() - 6 * 3600000;
    if (recentAlert && !significantChange(rule.last_value, ex.value, 3)) return skipped;
  } else if (importantOnly && !reallyChanged) {
    return skipped; // trang chưa đổi gì → im
  }

  const articleUrl = ex.link_index >= 0 && links[ex.link_index] ? links[ex.link_index].url : url;
  const inserted = await insertNotif(supabase, rule, {
    title,
    content: ex.content,
    details: ex.details,
    ai_summary: ex.ai_summary,
    source: host,
    source_url: articleUrl,
    sentiment: "neutral",
    is_important: hasCond ? true : ex.is_important,
  });
  return { inserted, value: skipped.value, contentHash: fp, note: { title, kind: "real" } };
}

// ---- ĐƯỜNG RSS (Pha C): tin tức lấy từ feed báo VN — link LUÔN thật, 0 grounding ----

// Thông tin tối thiểu của thông báo gần nhất (cho fallback "chưa có thay đổi").
interface PrevNotif {
  id?: string;
  title?: string;
  source?: string;
  source_url?: string;
  created_at?: string;
}

// Ngữ cảnh cổng gửi của 1 rule — tính 1 lần, dùng chung các đường quét.
interface GateCtx {
  hasCond: boolean;
  forceSend: boolean;
  scheduled: boolean;
  importantOnly: boolean;
  changeGate: boolean;
  lastValNorm: string;
}

// Gửi thông báo "trạng thái" khi KHÔNG có tin thật (dùng chung đường RSS + search).
// Giữ nguyên hành vi cũ: chỉ rule định kỳ/đặt giờ (forceSend) + không ở chế độ lọc;
// tôn trọng chu kỳ (1 filler/chu kỳ); filler chỉ push khi rule đặt giờ.
// deno-lint-ignore no-explicit-any
async function sendFallback(
  supabase: any,
  rule: Rule,
  ctx: GateCtx,
  prev: PrevNotif | undefined,
  related: NotifFields | null, // ứng viên "liên quan nhất" khi rule chưa từng có tb (hoặc null)
  value?: string,
): Promise<MonitorRuleResult> {
  const skipped: MonitorRuleResult = { inserted: 0, value, note: { title: "", kind: "skipped" } };
  if (!ctx.forceSend || ctx.importantOnly) return skipped;
  const prevMs = prev?.created_at ? Date.parse(prev.created_at) : 0;
  if (prevMs >= Date.now() - intervalMs(rule.frequency)) return skipped; // đã có tb trong chu kỳ

  const topic = (rule.keyword || rule.title || "thông tin").slice(0, 60);
  if (prev) {
    const title = `Chưa có thay đổi mới: ${topic}`;
    const inserted = await insertNotif(supabase, rule, {
      title,
      content: "Tạm thời chưa tìm thấy thông tin mới theo yêu cầu — chưa có thay đổi so với thông báo trước. Bạn có thể xem lại thông báo gần nhất bên dưới.",
      details: "",
      ai_summary: "Chưa có thay đổi so với lần trước.",
      source: prev.source || "Web",
      source_url: "",
      related_notification_id: prev.id,
      sentiment: "neutral",
      is_important: false,
    }, ctx.scheduled);
    return { inserted, value, note: { title, kind: "nochange" } };
  }
  if (related) {
    const title = `Gợi ý liên quan: ${related.title.slice(0, 120)}`;
    const inserted = await insertNotif(supabase, rule, {
      ...related,
      title,
      content: `Chưa tìm thấy thông tin đúng yêu cầu của bạn. Đây là thông tin liên quan/mới nhất tìm được:\n${related.content}`,
      is_important: false,
    }, ctx.scheduled);
    return { inserted, value, note: { title, kind: "related" } };
  }
  const title = `Chưa tìm thấy thông tin: ${topic}`;
  const inserted = await insertNotif(supabase, rule, {
    title,
    content: "Hiện chưa tìm thấy thông tin nào theo yêu cầu của bạn. Hệ thống sẽ tiếp tục theo dõi và cập nhật ở lần quét kế tiếp.",
    details: "",
    ai_summary: "Chưa tìm thấy thông tin theo yêu cầu.",
    source: "Web",
    source_url: "",
    sentiment: "neutral",
    is_important: false,
  }, ctx.scheduled);
  return { inserted, value, note: { title, kind: "none" } };
}

// Fetch feed RSS theo category (song song, nuốt lỗi lẻ). null = TẤT CẢ hỏng → grounding.
// cache: sống trong 1 lượt run-monitor — nhiều rule cùng category thì chỉ fetch feed 1 lần
// (cache cả kết quả null: feed hỏng thì đừng thử lại n lần trong cùng lượt).
type RssCache = Map<string, RssItem[] | null>;

async function fetchRssItems(category?: string | null, cache?: RssCache): Promise<RssItem[] | null> {
  const key = String(category ?? "news");
  if (cache?.has(key)) return cache.get(key)!;
  const result = await (async (): Promise<RssItem[] | null> => {
    const feeds = feedsForCategory(category);
    if (feeds.length === 0) return null;
    const settled = await Promise.allSettled(
      feeds.map(async (u) => {
        const res = await fetch(u, { headers: { "Accept": "application/rss+xml, application/xml, text/xml" } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return parseRss(await res.text());
      }),
    );
    const lists = settled
      .filter((s): s is PromiseFulfilledResult<RssItem[]> => s.status === "fulfilled")
      .map((s) => s.value);
    if (lists.length === 0) return null;
    return mergeRssItems(lists);
  })();
  cache?.set(key, result);
  return result;
}

interface RssPick {
  index: number; // -1 = không bài nào thực sự liên quan
  content: string;
  ai_summary: string;
  sentiment: string;
  is_important: boolean;
  matches_condition: boolean;
  value: string;
  changed: boolean;
}

// Flash-lite CHỌN bài hợp chủ đề nhất trong danh sách + tóm tắt (KHÔNG grounding — rẻ,
// không đụng quota 1.500). Lỗi → throw để caller quyết định fallback.
// deno-lint-ignore no-explicit-any
async function pickRssItemAI(supabase: any, rule: Rule, items: RssItem[]): Promise<RssPick> {
  const hasCond = Boolean(rule.condition && rule.condition.trim());
  const prevVal = rule.last_value?.trim() ?? "";
  const list = items
    .map((it, i) => `[${i}] ${it.title} — ${it.description.slice(0, 160)}`)
    .join("\n");
  try {
    const { text, model: usedModel } = await geminiGenerate({
      system: "Bạn chọn bài báo phù hợp nhất từ danh sách RSS và tóm tắt ngắn gọn tiếng Việt. TUYỆT ĐỐI không bịa thông tin ngoài tiêu đề + mô tả đã cho. Chỉ trả JSON thuần.",
      user: `Chủ đề người dùng theo dõi: "${rule.keyword}".
${hasCond ? `Điều kiện người dùng quan tâm: "${rule.condition}".` : ""}
${prevVal ? `Số liệu ghi nhận lần trước: "${prevVal}".` : ""}
Danh sách bài MỚI trên báo (đánh số):
${list}

Chọn 1 bài PHÙ HỢP NHẤT với chủ đề. Trả JSON:
{
  "index": số thứ tự bài chọn (0-${items.length - 1}), hoặc -1 nếu KHÔNG bài nào thật sự liên quan chủ đề,
  "content": "3-5 câu tóm tắt từ tiêu đề + mô tả của bài đã chọn (không bịa số liệu)",
  "ai_summary": "1 câu ngắn ~15 từ điểm mấu chốt",
  "sentiment": "positive | neutral | negative",
  "is_important": true nếu tin đáng chú ý với người theo dõi chủ đề này, ngược lại false,
  "matches_condition": ${hasCond ? `true nếu bài cho thấy điều kiện "${rule.condition}" đã xảy ra, ngược lại false` : "true"},
  "value": "số liệu chính trong bài kèm đơn vị nếu có, \\"\\" nếu không",
  "changed": ${prevVal ? `true nếu "value" khác đáng kể so với "${prevVal}"` : "true"}
}`,
      json: true,
      temperature: 0.2,
      model: "gemini-2.5-flash-lite",
      fallbackModels: CHEAP_FALLBACK, // lite free chỉ còn 20 lượt/ngày (2026-07)
    });
    await logUsage(supabase, rule.id, true, undefined, usedModel);
    const d = parseJsonLoose<Partial<RssPick>>(text);
    return {
      index: Number.isFinite(Number(d?.index)) ? Number(d?.index) : -1,
      content: String(d?.content ?? ""),
      ai_summary: String(d?.ai_summary ?? ""),
      sentiment: String(d?.sentiment ?? "neutral"),
      is_important: toBool(d?.is_important),
      matches_condition: toBool(d?.matches_condition),
      value: String(d?.value ?? ""),
      changed: toBool(d?.changed),
    };
  } catch (e) {
    await logUsage(supabase, rule.id, false, (e as Error).message);
    throw e;
  }
}

// Quét rule tin tức bằng RSS. Trả null = hạ tầng RSS/AI hỏng → caller dùng grounding.
// Có kết quả (kể cả skipped/filler) = ĐÃ xử lý xong, KHÔNG đốt grounding.
// deno-lint-ignore no-explicit-any
async function monitorRssPath(
  supabase: any,
  rule: Rule,
  ctx: GateCtx,
  seenTitles: Set<string>,
  seenLinks: Set<string>,
  prev: PrevNotif | undefined,
  rssCache?: RssCache,
): Promise<MonitorRuleResult | null> {
  const items = await fetchRssItems(rule.category, rssCache);
  if (!items || items.length === 0) return null;

  // Dedup TRƯỚC khi hỏi AI: tiêu đề feed ổn định tuyệt đối nên lọc thẳng bài đã gửi
  // (2 lớp: tiêu đề + link chuẩn hóa — báo sửa tít nhẹ thì link vẫn bắt được).
  const unseen = items
    .filter((it) => {
      if (seenTitles.has(normTitle(it.title))) return false;
      const l = normLink(it.link);
      return !l || !seenLinks.has(l);
    })
    .slice(0, 25);
  if (unseen.length === 0) {
    // Feed không có gì mới → filler theo luật chung, khỏi tốn grounding.
    return await sendFallback(supabase, rule, ctx, prev, null);
  }

  let pick: RssPick;
  try {
    pick = await pickRssItemAI(supabase, rule, unseen);
  } catch {
    return null; // flash-lite lỗi → thử đường grounding (lỗi khác nhau, đáng thử)
  }

  const chosen = pick.index >= 0 ? unseen[pick.index] : undefined;
  if (!chosen) {
    // Không bài nào liên quan chủ đề → filler, không đốt grounding.
    return await sendFallback(supabase, rule, ctx, prev, null);
  }

  const v = pick.value.trim();
  const value = v ? v.slice(0, 200) : undefined;
  const condOk = !ctx.hasCond || pick.matches_condition;
  const changeOk = !ctx.changeGate || pick.changed;
  const importantOk = !ctx.importantOnly || pick.is_important || (ctx.hasCond && pick.matches_condition);

  if (condOk && changeOk && importantOk) {
    // Đọc BÀI GỐC để viết bản tin đầy đủ + mục phân tích (trước đây chỉ tóm từ mô tả
    // feed 1-2 câu nên thông báo sơ sài, mục "Phân tích chi tiết" trống).
    const rich = await enrichFromArticle(supabase, rule, chosen.link, chosen.title);
    const inserted = await insertNotif(supabase, rule, {
      title: chosen.title,
      content: rich?.content || pick.content || chosen.description,
      details: rich?.details ?? "",
      ai_summary: rich?.ai_summary || pick.ai_summary,
      source: sourceFromLink(chosen.link),
      source_url: chosen.link, // link THẬT từ feed — hết cảnh link bịa/sai bài
      sentiment: normSentiment(pick.sentiment),
      is_important: pick.is_important,
    });
    return { inserted, value, note: { title: chosen.title, kind: "real" } };
  }

  // Có bài liên quan nhưng không vượt cổng → fallback (kèm gợi ý bài đó nếu rule chưa có tb).
  return await sendFallback(supabase, rule, ctx, prev, {
    title: chosen.title,
    content: pick.content || chosen.description,
    details: "",
    ai_summary: pick.ai_summary,
    source: sourceFromLink(chosen.link),
    source_url: chosen.link,
    sentiment: normSentiment(pick.sentiment),
    is_important: false,
  }, value);
}

// NHẮC HẸN (Pha D): đến hẹn → push 1 thông báo nhắc rồi TỰ TẮT rule. 0 call AI.
// deno-lint-ignore no-explicit-any
async function monitorReminder(supabase: any, rule: Rule): Promise<MonitorRuleResult> {
  // CHƯA TỚI GIỜ HẸN → không bắn. Cần chốt này vì quét THỦ CÔNG ("Kiểm tra tin ngay")
  // bỏ qua isDue — không chặn thì bấm thử với nhắc hẹn tương lai là bắn luôn trước giờ.
  if (Date.now() < Date.parse(String(rule.remind_at))) {
    return { inserted: 0, note: { title: "", kind: "skipped" } };
  }

  // CLAIM chống bắn TRÙNG: 2 lượt run-monitor có thể chạy CHỒNG nhau (cron chính 15'
  // + reminder-tick mỗi phút) — cả hai cùng thấy "chưa bắn" thì cả hai cùng push.
  // UPDATE có điều kiện là thao tác NGUYÊN TỬ ở Postgres: chỉ lượt ĐẦU khớp điều kiện
  // (last_run_at còn TRƯỚC mốc hẹn) và nhận được row; lượt sau khớp 0 row → bỏ qua.
  const { data: claimed, error: claimErr } = await supabase
    .from("rules")
    .update({ last_run_at: new Date().toISOString() })
    .eq("id", rule.id)
    .eq("is_active", true)
    .or(`last_run_at.is.null,last_run_at.lt."${rule.remind_at}"`)
    .select("id");
  if (claimErr || !claimed || claimed.length === 0) {
    return { inserted: 0, note: { title: "", kind: "skipped" } }; // lượt khác đã bắn rồi
  }

  const remindMs = Date.parse(String(rule.remind_at));
  const lateMin = Math.max(0, Math.round((Date.now() - remindMs) / 60000));
  const what = (rule.title || rule.keyword || "việc bạn đã hẹn").slice(0, 150);
  const whenVn = new Date(remindMs + 7 * 3600000);
  const whenTxt = `${String(whenVn.getUTCHours()).padStart(2, "0")}:${String(whenVn.getUTCMinutes()).padStart(2, "0")} ${String(whenVn.getUTCDate()).padStart(2, "0")}/${String(whenVn.getUTCMonth() + 1).padStart(2, "0")}`;
  const title = `⏰ Nhắc hẹn: ${what}`;
  const inserted = await insertNotif(supabase, rule, {
    title,
    content: `Bạn đã đặt nhắc "${what}" lúc ${whenTxt} (giờ VN)${lateMin > 15 ? ` — nhắc muộn ${lateMin} phút do hệ thống bận, xin lỗi nhé` : ""}.${rule.description ? `\nGhi chú: ${rule.description}` : ""}`,
    details: "",
    ai_summary: `Đến hẹn: ${what}.`,
    source: "Nhắc hẹn",
    source_url: "",
    sentiment: "neutral",
    is_important: true, // người dùng chủ động đặt hẹn = quan trọng
  });
  // Nhắc 1 lần rồi TỰ XÓA HẲN rule (user chọn 2026-07-03) — nhưng GIỮ thông báo nhắc:
  // gán chủ sở hữu trực tiếp + gỡ rule_id TRƯỚC khi xóa để FK cascade không kéo nó theo.
  // Migration 0021 chưa chạy (thiếu cột user_id) → update lỗi → giữ hành vi cũ: tắt rule
  // (client vẫn gom vào mục "Nhắc hẹn đã xong").
  if (inserted > 0) {
    const { error: detachErr } = await supabase
      .from("notifications")
      .update({ user_id: rule.user_id, rule_id: null })
      .eq("rule_id", rule.id);
    if (!detachErr) {
      await supabase.from("rules").delete().eq("id", rule.id);
    } else {
      await supabase.from("rules").update({ is_active: false }).eq("id", rule.id);
    }
  }
  return { inserted, note: { title, kind: "real" } };
}

// deno-lint-ignore no-explicit-any
async function monitorRule(supabase: any, rule: Rule, manual = false, rssCache?: RssCache): Promise<MonitorRuleResult> {
  // NHẮC HẸN: không cần nguồn tin — bắn thông báo rồi tắt rule.
  if (isReminder(rule)) return await monitorReminder(supabase, rule);

  // ROUTER: rule "url" (theo dõi TRANG CỤ THỂ) đi đường fetch trang trực tiếp. Lỗi
  // (trang sập/URL hỏng) thì DỪNG ở đó chờ lượt sau — KHÔNG rơi xuống Gemini search,
  // vì search không đọc được trang cụ thể, chỉ tốn quota và trả tin lạc đề.
  const srcType: SourceType = ruleWatchUrl(rule) ? "url" : detectSourceType(rule.keyword);
  if (srcType === "url") {
    // Lỗi (trang sập/URL hỏng) NÉM LÊN vòng ngoài: vẫn "bỏ lượt này chờ lượt sau"
    // (vòng ngoài bắt + tiếp tục rule khác) nhưng được ghi vào rules.last_error
    // để người dùng thấy vì sao rule im — thay vì nuốt im ở đây.
    return await monitorUrl(supabase, rule, manual);
  }

  // Rule số liệu (thời tiết/crypto/tỷ giá) đi đường provider — chính xác,
  // 0 quota grounding. Provider lỗi (API sập, không nhận diện được...) → fallback search.
  if (srcType !== "search") {
    try {
      return await monitorProvider(supabase, rule, srcType);
    } catch (e) {
      console.log(`Provider ${srcType} lỗi (${(e as Error).message}) → fallback Gemini search.`);
    }
  }

  const hasCond = Boolean(rule.condition && rule.condition.trim());
  // KHÔNG có điều kiện (định kỳ / đặt giờ) → LUÔN gửi 1 tb khi tới hạn, kể cả khi
  // không tìm thấy tin mới. CÓ điều kiện ("theo đk") → chỉ gửi khi thỏa, không thì im.
  const forceSend = !hasCond;
  // Rule ĐẶT GIỜ (vd hằng ngày 08:00) = LỊCH HẸN người dùng chủ động đặt, không phải
  // "bộ lọc tin": tại giờ hẹn LUÔN giao 1 bản tin (tin thật hoặc fallback) và LUÔN push.
  const scheduled = isScheduled(rule);
  // Chế độ "chỉ tin quan trọng": BỎ fallback + tin thật chỉ qua khi is_important hoặc thỏa điều kiện.
  // KHÔNG áp cho rule đặt giờ (bản tin đúng hẹn là thứ được yêu cầu, lọc là sai ý).
  const importantOnly = rule.notify_mode === "important" && !scheduled;
  // Rule "theo điều kiện" + đã có giá trị nền → chỉ báo khi giá trị THỰC SỰ đổi.
  const changeGate = rule.frequency === "change" && Boolean(rule.last_value && rule.last_value.trim());
  const lastValNorm = normVal(String(rule.last_value ?? ""));

  // Lấy tiêu đề ĐÃ GỬI trước khi gọi Gemini: vừa để dedup, vừa đưa vào prompt bảo Gemini
  // NÉ các bài đó (sửa gốc vòng lặp "luôn trả đúng 1 bài nổi nhất → trùng mãi → toàn filler").
  const { data: existing } = await supabase
    .from("notifications")
    .select("id, title, source, source_url, created_at")
    .eq("rule_id", rule.id)
    .order("created_at", { ascending: false });
  const seenTitles = new Set<string>(
    (existing ?? []).map((n: { title: string }) => normTitle(String(n.title ?? ""))).filter(Boolean)
  );
  const seenLinks = new Set<string>(
    (existing ?? []).map((n: { source_url?: string }) => normLink(String(n.source_url ?? ""))).filter(Boolean)
  );
  const avoidTitles = recentRealTitles((existing ?? []).map((n: { title: string }) => n.title));
  const prev = (existing ?? [])[0] as PrevNotif | undefined;

  const ctx: GateCtx = { hasCond, forceSend, scheduled, importantOnly, changeGate, lastValNorm };

  // ĐƯỜNG RSS TRƯỚC (Pha C): tin lấy từ feed báo VN — link luôn thật, dedup chuẩn,
  // chỉ tốn 1 call flash-lite (không grounding). Chỉ khi hạ tầng RSS/AI hỏng mới
  // rơi xuống Gemini + Google Search bên dưới (giữ grounding làm phương án cuối).
  const rssResult = await monitorRssPath(supabase, rule, ctx, seenTitles, seenLinks, prev, rssCache);
  if (rssResult) return rssResult;

  // Gọi Gemini (lỗi mạng/quota sẽ THROW → caller xử lý; chỉ nuốt lỗi parse).
  // Log mỗi call vào usage_logs để theo dõi quota (kể cả khi lỗi).
  let text: string, sources: GeminiSource[];
  try {
    const gen = await geminiGenerate({
      system: SEARCH_SYSTEM,
      user: buildPrompt(rule, avoidTitles),
      grounding: true,
      temperature: 0.2,
    });
    text = gen.text;
    sources = gen.sources;
    await logUsage(supabase, rule.id, true, undefined, gen.model);
  } catch (e) {
    await logUsage(supabase, rule.id, false, (e as Error).message);
    throw e;
  }
  const pool: GeminiSource[] = [...sources];
  let items: NewsItem[] = [];
  try {
    const parsed = parseJsonLoose<NewsItem[]>(text);
    if (Array.isArray(parsed)) items = parsed;
  } catch { /* model không trả JSON → coi như không tìm thấy */ }

  // Chọn ứng viên: Gemini trả tối đa 3 bài — lấy bài ĐẦU TIÊN chưa trùng tiêu đề đã gửi
  // (bỏ bài quá cũ theo published_date). Tất cả trùng → giữ bài đầu cho nhánh fallback.
  const { top, fresh } = pickFreshItem(items, seenTitles, lastValNorm);
  let value: string | undefined;
  let inserted = 0;
  let note: { title: string; kind: NotifKind } | undefined;

  // 1) Có tin và VƯỢT các cổng (điều kiện / thay đổi / chống trùng) → gửi tin THẬT.
  if (top) {
    const v = String(top.value ?? "").trim();
    if (v) value = v.slice(0, 200);

    const condOk = !hasCond || toBool(top.matches_condition);
    const changeOk = !changeGate || toBool(top.changed);
    // Chế độ "chỉ tin quan trọng": tin phải ĐÁNG CHÚ Ý (is_important) hoặc thỏa điều kiện rule mới qua.
    const importantOk = !importantOnly || toBool(top.is_important) || (hasCond && toBool(top.matches_condition));
    // Link: ưu tiên URL nguồn THẬT từ grounding (top.source_url do AI tự ghi, hay bị bịa/sai bài).
    const url = pool.length > 0 ? pool[0].uri : (isUrl(top.source_url) ? top.source_url : "");

    if (condOk && changeOk && fresh && importantOk) {
      inserted += await insertNotif(supabase, rule, {
        title: String(top.title ?? ""),
        content: String(top.content ?? ""),
        details: String(top.details ?? ""),
        ai_summary: String(top.ai_summary ?? ""),
        source: String(top.source ?? "Web"),
        source_url: url,
        sentiment: normSentiment(top.sentiment),
        is_important: toBool(top.is_important),
      });
      note = { title: String(top.title ?? ""), kind: "real" };
    }
  }

  // 2) CHƯA gửi được tin thật → fallback "trạng thái" theo luật chung (sendFallback:
  // chỉ rule định kỳ/đặt giờ, tôn trọng chu kỳ, filler chỉ push khi đặt giờ).
  if (inserted === 0) {
    const related: NotifFields | null = top
      ? {
          title: String(top.title ?? ""),
          content: String(top.content ?? ""),
          details: String(top.details ?? ""),
          ai_summary: String(top.ai_summary ?? "Thông tin liên quan gần nhất."),
          source: String(top.source ?? "Web"),
          source_url: pool.length > 0 ? pool[0].uri : (isUrl(top.source_url) ? top.source_url : ""),
          sentiment: normSentiment(top.sentiment),
          is_important: false,
        }
      : null;
    return await sendFallback(supabase, rule, ctx, prev, related, value);
  }

  return { inserted, value, note };
}

// SOI BỘ LỌC (gateCheck): gọi Gemini 1 lần cho 1 rule, rồi cho biết MỖI chế độ thông báo
// (all vs important) SẼ quyết định gì với tin tìm được — KHÔNG ghi notification nào.
// Dùng ở Trang test để thấy bộ lọc chống rác hoạt động ra sao trên dữ liệu thật.
interface GatePreview {
  gateCheck: true;
  keyword: string;
  currentMode: string;       // notify_mode hiện tại của rule
  provider?: string;         // nguồn dữ liệu đã dùng: weather/crypto/fx (không có = Gemini search)
  found: boolean;            // Gemini có trả tin nào không
  candidateTitle: string;
  value: string;
  isImportant: boolean;
  matchesCondition: boolean;
  changed: boolean;
  fresh: boolean;            // không trùng tin đã có (theo tiêu đề / giá trị đổi)
  allKind: NotifKind;        // chế độ "Đầy đủ" sẽ tạo loại gì
  importantPushed: boolean;  // chế độ "Chỉ tin quan trọng" có báo không
  importantReason: string;   // vì sao chế độ "Chỉ tin quan trọng" bỏ (nếu không báo)
}

// deno-lint-ignore no-explicit-any
async function previewGate(supabase: any, rule: Rule): Promise<GatePreview> {
  const hasCond = Boolean(rule.condition && rule.condition.trim());
  const forceSend = !hasCond;
  const scheduled = isScheduled(rule); // rule đặt giờ: chế độ lọc KHÔNG áp (luôn giao bản tin đúng hẹn)
  const changeGate = rule.frequency === "change" && Boolean(rule.last_value && rule.last_value.trim());
  const lastValNorm = normVal(String(rule.last_value ?? ""));

  const base: GatePreview = {
    gateCheck: true,
    keyword: rule.keyword,
    currentMode: rule.notify_mode ?? "all",
    found: false,
    candidateTitle: "",
    value: "",
    isImportant: false,
    matchesCondition: false,
    changed: false,
    fresh: false,
    allKind: "skipped",
    importantPushed: false,
    importantReason: "",
  };

  // ROUTER: rule "url" → soi bằng fetch trang thật + flash-lite (giống monitorUrl, không insert).
  const srcType: SourceType = ruleWatchUrl(rule) ? "url" : detectSourceType(rule.keyword);
  if (srcType === "url") {
    base.provider = "url";
    try {
      const url = ruleWatchUrl(rule);
      const host = new URL(url).hostname;
      const page = await fetchWatchPage(url, rule.watch_auth);
      if (page.status === 401 || page.status === 403) {
        base.importantReason = `Trang ${host} đòi đăng nhập (HTTP ${page.status}) — cần cấp quyền (dán Cookie) trong chi tiết rule.`;
        return base;
      }
      // Soi theo đường ĐỌC TRANG (kèm link bài để giống hành vi thật). Đường feed của
      // trang tin không soi ở đây (không insert nên không tính được dedup) — chấp nhận.
      const ex = await extractUrlAI(supabase, rule, page, extractPageLinks(page.html, page.finalUrl));
      if (ex.login_required && !ex.found && page.text.length < 6000) {
        base.importantReason = `Nội dung trang ${host} bị che sau đăng nhập — cần cấp quyền (dán Cookie) trong chi tiết rule.`;
        return base;
      }
      base.found = ex.found;
      base.candidateTitle = ex.title;
      base.value = ex.value;
      base.fresh = true;
      base.isImportant = ex.is_important;
      base.matchesCondition = ex.matches_condition;
      const prevNorm = normVal(String(rule.last_value ?? ""));
      const curNorm = normVal(ex.value);
      base.changed = prevNorm === "" || (curNorm !== "" && curNorm !== prevNorm) || ex.changed;
      if (!ex.found) {
        base.importantReason = "Trang không có thông tin cần theo dõi.";
        return base;
      }
      if (hasCond) {
        base.allKind = ex.matches_condition ? "real" : "skipped";
        base.importantPushed = ex.matches_condition;
        base.importantReason = ex.matches_condition ? "" : "Chưa thỏa điều kiện (chấm trên nội dung trang thật).";
      } else {
        base.allKind = "real";
        base.importantPushed = scheduled || base.changed;
        base.importantReason = base.importantPushed
          ? ""
          : "Nội dung trang chưa đổi → chế độ 'chỉ tin quan trọng' im (chế độ Đầy đủ vẫn gửi).";
      }
    } catch (e) {
      base.importantReason = `Không đọc được trang: ${(e as Error).message}`;
    }
    return base;
  }

  // Rule số liệu → soi bằng PROVIDER (giống monitorRule; 0 quota grounding).
  if (srcType !== "search") {
    try {
      const p = await fetchProviderNotif(rule, srcType);
      base.provider = srcType;
      base.found = true;
      base.candidateTitle = p.title;
      base.value = p.value;
      base.fresh = true;
      base.changed = significantChange(rule.last_value, p.value, 1);
      if (hasCond) {
        const matches = await evalConditionAI(supabase, rule, p.value);
        base.matchesCondition = matches;
        base.isImportant = matches;
        base.allKind = matches ? "real" : "skipped";
        base.importantPushed = matches;
        base.importantReason = matches ? "" : "Chưa thỏa điều kiện (chấm trên số thật từ API).";
      } else {
        base.matchesCondition = true;
        base.allKind = "real";
        base.importantPushed = scheduled || base.changed;
        base.importantReason = base.importantPushed
          ? ""
          : "Số liệu chưa đổi ≥1% → chế độ 'chỉ tin quan trọng' im (chế độ Đầy đủ vẫn gửi).";
      }
      return base;
    } catch { /* provider lỗi → rơi xuống đường Gemini search bên dưới */ }
  }

  // Lấy tiêu đề đã có TRƯỚC khi gọi Gemini (giống monitorRule): dedup + đưa vào prompt để né.
  const { data: existing } = await supabase
    .from("notifications").select("title").eq("rule_id", rule.id)
    .order("created_at", { ascending: false });
  const seenTitles = new Set<string>(
    (existing ?? []).map((n: { title: string }) => normTitle(String(n.title ?? ""))).filter(Boolean),
  );
  const avoidTitles = recentRealTitles((existing ?? []).map((n: { title: string }) => n.title));
  const hasPrev = (existing ?? []).length > 0;

  // ĐƯỜNG RSS (giống monitorRule): soi bằng feed + flash-lite — không grounding.
  try {
    const rssItems = await fetchRssItems(rule.category);
    if (rssItems && rssItems.length > 0) {
      const unseen = rssItems.filter((it) => !seenTitles.has(normTitle(it.title))).slice(0, 25);
      base.provider = "rss";
      if (unseen.length === 0) {
        base.allKind = forceSend ? (hasPrev ? "nochange" : "none") : "skipped";
        base.importantPushed = scheduled && forceSend;
        base.importantReason = base.importantPushed
          ? "Rule đặt giờ: vẫn gửi bản tin fallback tại giờ hẹn."
          : "Feed không có bài mới (tất cả đã gửi trước đó).";
        return base;
      }
      const pick = await pickRssItemAI(supabase, rule, unseen);
      const chosen = pick.index >= 0 ? unseen[pick.index] : undefined;
      if (!chosen) {
        base.allKind = forceSend ? (hasPrev ? "nochange" : "none") : "skipped";
        base.importantPushed = scheduled && forceSend;
        base.importantReason = base.importantPushed
          ? "Rule đặt giờ: vẫn gửi bản tin fallback tại giờ hẹn."
          : "Không bài nào trên feed liên quan chủ đề.";
        return base;
      }
      base.found = true;
      base.candidateTitle = chosen.title;
      base.value = pick.value;
      base.fresh = true; // đã lọc unseen từ trước
      base.isImportant = pick.is_important;
      base.matchesCondition = pick.matches_condition;
      base.changed = pick.changed;
      const condOk = !hasCond || pick.matches_condition;
      const changeOk = !changeGate || pick.changed;
      const importantOk = pick.is_important || (hasCond && pick.matches_condition);
      const realPasses = condOk && changeOk;
      base.allKind = realPasses ? "real" : (forceSend ? (hasPrev ? "nochange" : "related") : "skipped");
      base.importantPushed = scheduled ? (realPasses || forceSend) : (realPasses && importantOk);
      if (!base.importantPushed) {
        if (!condOk) base.importantReason = "Chưa thỏa điều kiện của rule.";
        else if (!changeOk) base.importantReason = "Số liệu chưa thay đổi so với lần trước.";
        else if (!importantOk) base.importantReason = "Tin không quan trọng và không thỏa điều kiện → bị lọc.";
        else base.importantReason = "Bị lọc.";
      } else if (scheduled && !realPasses) {
        base.importantReason = "Rule đặt giờ: gửi fallback (kèm push) tại giờ hẹn dù chưa có tin mới.";
      }
      return base;
    }
  } catch { /* RSS/AI lỗi → rơi xuống đường grounding bên dưới */ }
  base.provider = undefined;

  // Gọi Gemini (1 call). Lỗi quota/mạng → THROW để caller báo lỗi.
  const gen = await geminiGenerate({
    system: SEARCH_SYSTEM,
    user: buildPrompt(rule, avoidTitles),
    grounding: true,
    temperature: 0.2,
  });
  await logUsage(supabase, rule.id, true, undefined, gen.model);

  let items: NewsItem[] = [];
  try {
    const parsed = parseJsonLoose<NewsItem[]>(gen.text);
    if (Array.isArray(parsed)) items = parsed;
  } catch { /* không JSON → coi như không tìm thấy */ }

  // Chọn ứng viên GIỐNG HỆT monitorRule: bài đầu tiên chưa trùng (bỏ bài quá cũ).
  const { top, fresh } = pickFreshItem(items, seenTitles, lastValNorm);

  if (!top) {
    // Không có tin: chế độ Đầy đủ vẫn gửi filler (nếu rule định kỳ); Chỉ-quan-trọng thì bỏ.
    base.allKind = forceSend ? (hasPrev ? "nochange" : "none") : "skipped";
    if (scheduled) {
      base.importantPushed = true;
      base.importantReason = "Rule đặt giờ: luôn gửi bản tin (kèm push) tại giờ hẹn, chế độ lọc không áp.";
    } else {
      base.importantReason = "Không có tin nào để báo.";
    }
    return base;
  }

  const v = String(top.value ?? "").trim();
  const condOk = !hasCond || toBool(top.matches_condition);
  const changeOk = !changeGate || toBool(top.changed);
  const importantOk = toBool(top.is_important) || (hasCond && toBool(top.matches_condition));

  base.found = true;
  base.candidateTitle = String(top.title ?? "");
  base.value = v;
  base.isImportant = toBool(top.is_important);
  base.matchesCondition = toBool(top.matches_condition);
  base.changed = toBool(top.changed);
  base.fresh = fresh;

  const realPasses = condOk && changeOk && fresh;
  // Chế độ Đầy đủ.
  if (realPasses) base.allKind = "real";
  else if (forceSend) base.allKind = hasPrev ? "nochange" : "related";
  else base.allKind = "skipped";

  // Chế độ Chỉ tin quan trọng. Rule ĐẶT GIỜ: chế độ lọc không áp — luôn giao bản tin đúng hẹn.
  base.importantPushed = scheduled ? (realPasses || forceSend) : (realPasses && importantOk);
  if (!base.importantPushed) {
    if (!condOk) base.importantReason = "Chưa thỏa điều kiện của rule.";
    else if (!changeOk) base.importantReason = "Số liệu chưa thay đổi so với lần trước.";
    else if (!fresh) base.importantReason = "Tin trùng với thông báo đã có.";
    else if (!importantOk) base.importantReason = "Tin không quan trọng và không thỏa điều kiện → bị lọc.";
    else base.importantReason = "Bị lọc.";
  } else if (scheduled && !realPasses) {
    base.importantReason = "Rule đặt giờ: gửi fallback (kèm push) tại giờ hẹn dù chưa có tin mới.";
  }
  return base;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const startedAt = Date.now();
  try {
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);

    // --- PHÂN QUYỀN ---
    // Lấy token từ header Authorization. Cron gửi service_role (admin); app gửi JWT user.
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    const role = decodeJwtRole(token);
    const isAdmin = token === serviceKey || role === "service_role";

    let authUserId: string | null = null;
    if (!isAdmin) {
      // Chỉ có anon key (chưa đăng nhập) hoặc không token → từ chối.
      if (!token || role === "anon" || !role) {
        return json({ error: "Cần đăng nhập để chạy giám sát." }, 401);
      }
      // Xác thực JWT thật sự, lấy userId TỪ TOKEN (không tin userId trong body).
      const { data: u, error: uErr } = await supabase.auth.getUser(token);
      if (uErr || !u?.user) return json({ error: "Phiên đăng nhập không hợp lệ." }, 401);
      authUserId = u.user.id;
    }

    const body = await req.json().catch(() => ({}));
    const { ruleId, userId, dryRun, gateCheck, reminderOnly, tick } = body as {
      ruleId?: string; userId?: string; dryRun?: boolean; gateCheck?: boolean;
      reminderOnly?: boolean; tick?: boolean;
    };

    // manual = bấm "Kiểm tra tin ngay" cho 1 rule → bỏ qua lịch, quét luôn.
    const manual = Boolean(ruleId);
    // tick = cron MỖI PHÚT (0022): chỉ nhắc hẹn + rule ghim giờ vừa tới mốc — cho đúng
    // giờ ±1' thay vì lệch theo nhịp cron chính 15'. reminderOnly là tên cũ (0017),
    // giữ làm alias trong lúc SQL cron cũ còn chạy.
    const tickMode = Boolean(tick || reminderOnly);
    const trigger = manual ? "manual" : tickMode ? "tick" : (isAdmin ? "cron" : "user");

    // Chọn tập rule cần quét. KHÔNG sắp ở SQL theo last_run_at nữa (sai bản chất: chỉ
    // nhìn "lâu chưa quét", bỏ qua chu kỳ riêng của từng rule). Việc ưu tiên sẽ làm ở
    // dưới theo "giờ đáng lẽ phải báo" (dueAt = last_run_at + chu kỳ) — xem dueRules.
    let query = supabase
      .from("rules")
      .select("*")
      .eq("is_active", true);
    if (ruleId) {
      // ruleId: lấy theo id rồi kiểm tra quyền sở hữu bên dưới.
      query = supabase.from("rules").select("*").eq("id", ruleId);
    } else if (isAdmin) {
      // Admin (cron) mới được nhắm userId tùy ý; không có userId → quét tất cả.
      if (userId) query = query.eq("user_id", userId);
    } else {
      // Người dùng thường: CHỈ rule của chính mình (bỏ qua userId trong body).
      query = query.eq("user_id", authUserId);
    }

    const { data: rules, error } = await query;
    if (error) return json({ error: error.message }, 500);
    if (!rules || rules.length === 0) {
      await logCronRun(supabase, trigger, 0, 0, false, Date.now() - startedAt);
      return json({ inserted: 0, checked: 0 });
    }

    // User thường chỉ được đụng vào rule của mình (chặn ruleId của người khác → 403).
    if (!isAdmin) {
      for (const r of rules as Rule[]) {
        if (r.user_id !== authUserId) {
          return json({ error: "Bạn không có quyền với rule này." }, 403);
        }
      }
    }

    // SOI BỘ LỌC: chỉ với 1 rule (ruleId). Gọi Gemini 1 lần, trả quyết định 2 chế độ, KHÔNG insert.
    if (gateCheck && ruleId) {
      const rule = (rules as Rule[])[0];
      if (!rule) return json({ error: "Không tìm thấy rule." }, 404);
      try {
        const result = await previewGate(supabase, rule);
        return json(result);
      } catch (e) {
        if (isQuotaErr(e)) return json({ error: "AI đang quá tải/hết lượt (quota). Thử lại sau." }, 429);
        return json({ error: (e as Error).message }, 500);
      }
    }

    // Ngân sách thời gian: quét tới ~70s thì dừng và trả phần đã làm, tránh nền tảng
    // kill tiến trình (timeout) khi có nhiều rule. Cron gọi lại sẽ quét tiếp.
    const deadline = Date.now() + 70000;
    let inserted = 0;
    let checked = 0;
    let quotaHit = false;
    const scannedNames: string[] = []; // tên rule thực sự được quét (để log "quét rule nào")
    const notes: { keyword: string; title: string; kind: NotifKind }[] = []; // tin tạo ra mỗi rule (cho trang test)

    // Lọc trước ra chỉ những rule tới hạn (isDue), sau đó quét hết danh sách đó.
    // isDue đã đóng vai trò quota gate tự nhiên: rule 1 tiếng chỉ tạo tối đa 24 call/ngày,
    // không cần cap cứng MAX_RULES_PER_RUN nữa (trước đây cap=2 làm rule bị trễ oan).
    //
    // Thứ tự quét: TẦNG ưu tiên trước (nhắc hẹn → rule GHIM GIỜ → định kỳ trơn — xem
    // scanTier), trong cùng tầng mới tới "giờ đáng lẽ phải báo" (dueAt; với rule ghim
    // giờ dueAt = mốc hẹn hôm nay). Quan trọng khi deadline 70s chỉ kịp quét một phần:
    // bản tin 8h phải đứng TRƯỚC đống rule tin tức tồn đọng, không bị chèn tới 10h.
    // LƯU Ý: không dùng .filter(isDue) trực tiếp — isDue(rule, nowMs?) sẽ nhận INDEX
    // của mảng làm nowMs (bug kinh điển kiểu parseInt trong map).
    // tickMode (cron tick mỗi phút): CHỈ nhắc hẹn + rule ghim giờ vừa tới mốc (cửa sổ
    // 10' — isTickDue), KHÔNG đụng rule định kỳ/điều kiện (đỡ quét chồng với cron chính
    // gây thông báo trùng + đỡ tốn quota).
    let dueRules = manual
      ? (rules as Rule[])
      : (rules as Rule[]).filter((r) => isDue(r))
          .sort((a, b) => scanTier(a) - scanTier(b) || dueAt(a) - dueAt(b));
    if (tickMode) dueRules = dueRules.filter((r) => isTickDue(r));

    // DRY-RUN: chỉ trả KẾ HOẠCH quét (rule nào tới hạn + thứ tự ưu tiên + rule còn
    // phải chờ) — KHÔNG gọi Gemini, KHÔNG tốn quota. Trang test dùng để kiểm chứng
    // logic chọn/sắp rule (đây là NGUỒN DUY NHẤT của logic, không tính lại ở client).
    if (dryRun) {
      const nowMs = Date.now();
      const waiting = (rules as Rule[])
        .filter((r) => !isDue(r))
        .sort((a, b) => dueAt(a) - dueAt(b));
      const lite = (r: Rule, i: number) => ({
        order: i + 1,
        id: r.id,
        keyword: r.keyword,
        frequency: r.frequency ?? null,
        run_at: r.run_at ?? null,
        last_run_at: r.last_run_at ?? null,
        due_at: new Date(dueAt(r)).toISOString(),
        overdue_ms: nowMs - dueAt(r), // >0 = đã trễ hạn; <0 = còn phải chờ
      });
      return json({
        dryRun: true,
        now: new Date(nowMs).toISOString(),
        total: rules.length,
        dueCount: dueRules.length,
        plan: dueRules.map(lite),
        waiting: waiting.map(lite),
      });
    }

    // Cache RSS sống trong 1 lượt run: nhiều rule cùng category chỉ fetch bộ feed 1 lần.
    const rssCache: RssCache = new Map();

    for (const rule of dueRules) {
      if (Date.now() > deadline) break;
      // AI đã kẹt quota trong lượt này → chỉ quét tiếp các rule KHÔNG cần AI (nhắc hẹn,
      // thời tiết/giá/tỷ giá không điều kiện). Trước đây break cả lượt → bản tin 8h
      // 0-AI cũng chết chùm chỉ vì đứng sau 1 rule tin tức hết quota.
      if (quotaHit && !isAiFreeRule(rule)) continue;

      // CLAIM chống bắn TRÙNG rule GHIM GIỜ: cron tick mỗi phút + cron chính 15' có thể
      // chạy CHỒNG, cả hai cùng thấy "tới mốc, chưa quét" thì bắn đúp. UPDATE có điều
      // kiện là nguyên tử ở Postgres: chỉ lượt ĐẦU (last_run_at còn TRƯỚC mốc hẹn) nhận
      // được row; lượt sau khớp 0 row → bỏ qua. (Nhắc hẹn đã có claim riêng trong
      // monitorReminder; manual thì người dùng chủ động bấm, không chặn.)
      const prevRunAt = rule.last_run_at ?? null;
      if (!manual && isScheduled(rule)) {
        const targetIso = new Date(dueAt(rule) - 60000).toISOString();
        const { data: claimed, error: claimErr } = await supabase
          .from("rules")
          .update({ last_run_at: new Date().toISOString() })
          .eq("id", rule.id)
          .eq("is_active", true)
          .or(`last_run_at.is.null,last_run_at.lt."${targetIso}"`)
          .select("id");
        if (claimErr || !claimed || claimed.length === 0) continue; // lượt khác đã nhận mốc này
      }

      // Giãn giữa các lần gọi trong cùng 1 run để né rate-limit theo phút.
      if (checked > 0) await sleep(4000);
      checked++;
      if (rule.keyword) scannedNames.push(rule.keyword);
      let newValue: string | undefined;
      let newHash: string | undefined;
      let scanError: string | null = null; // lỗi lượt này (null = quét êm) → rules.last_error
      try {
        const res = await monitorRule(supabase, rule, manual, rssCache);
        inserted += res.inserted;
        newValue = res.value;
        newHash = res.contentHash;
        if (res.note) notes.push({ keyword: rule.keyword, ...res.note });
      } catch (e) {
        console.log(`Rule ${rule.id} lỗi:`, (e as Error).message);
        // Hết quota/quá tải: rule này coi như CHƯA quét (không cập nhật last_run_at,
        // lượt cron sau thử lại) — nhưng KHÔNG break: rule 0-AI phía sau vẫn được quét.
        if (isQuotaErr(e)) {
          quotaHit = true;
          checked--;
          // Rule ghim giờ đã CLAIM (last_run_at bị đẩy lên now) mà chưa quét xong →
          // trả lại mốc cũ, để khung catch-up 4h của cron chính còn cứu được hôm nay.
          if (!manual && isScheduled(rule)) {
            await supabase.from("rules").update({ last_run_at: prevRunAt }).eq("id", rule.id);
          }
          continue;
        }
        scanError = String((e as Error).message ?? e).slice(0, 300);
      }
      // Đánh dấu đã quét (kể cả khi không có tin mới) để tính lịch lần sau;
      // cập nhật baseline số liệu nếu lần này tìm được giá trị mới (trigger "thay đổi").
      const upd: Record<string, string | null> = {
        last_run_at: new Date().toISOString(),
        last_error: scanError,
      };
      if (newValue) upd.last_value = newValue;
      if (newHash) upd.last_content_hash = newHash;
      let { error: updErr } = await supabase.from("rules").update(upd).eq("id", rule.id);
      if (updErr && "last_content_hash" in upd) {
        // Cột last_content_hash chưa có (migration 0023 chưa chạy) → ghi lại không kèm.
        delete upd.last_content_hash;
        ({ error: updErr } = await supabase.from("rules").update(upd).eq("id", rule.id));
      }
      if (updErr) {
        // Cột last_error chưa có (migration 0020 chưa chạy) → ghi lại không kèm nó,
        // tuyệt đối không để mất last_run_at (mất là loạn lịch quét).
        delete upd.last_error;
        await supabase.from("rules").update(upd).eq("id", rule.id);
      }
    }

    await logCronRun(
      supabase, trigger, checked, inserted, quotaHit, Date.now() - startedAt,
      scannedNames.join(", ") || undefined,
    );
    // Cảnh báo admin khi quota ngày vượt ~80% (chỉ nhịp cron nền, báo 1 lần/ngày).
    if (trigger === "cron") await maybeAlertQuota(supabase, checked);
    return json({ inserted, checked, quotaHit, notes });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
