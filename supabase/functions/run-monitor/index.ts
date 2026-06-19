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
import { geminiGenerate, parseJsonLoose, GeminiSource } from "../_shared/gemini.ts";

// Mỗi lần quét 1 rule chỉ tạo 1 thông báo (tin mới/đáng chú ý nhất, hoặc 1 tb fallback).
const MAX_RULES_PER_RUN = 8; // trần số rule gọi Gemini trong 1 lần (giữ quota + tránh timeout)

// Lỗi hết quota / quá tải tạm thời từ Gemini → nên DỪNG sớm thay vì đốt thêm request.
function isQuotaErr(e: unknown): boolean {
  const m = (e instanceof Error ? e.message : String(e)).toLowerCase();
  return m.includes("429") || m.includes("resource_exhausted") || m.includes("quota") ||
    m.includes("rate") || m.includes("503") || m.includes("overloaded");
}

// frequency lưu dạng "change" (theo điều kiện → quét 15 phút) HOẶC số phút (định kỳ, tối thiểu 30).
// Khóa cũ (enum) vẫn được map để tương thích rule tạo trước đây.
const LEGACY_FREQ: Record<string, number> = {
  m30: 30, hourly: 60, daily: 1440, weekly: 10080, realtime: 30,
};
function intervalMs(freq?: string): number {
  let mins = 30;
  if (freq === "change") mins = 15;
  else if (freq && freq in LEGACY_FREQ) mins = LEGACY_FREQ[freq];
  else {
    const n = parseInt(freq ?? "", 10);
    if (Number.isFinite(n) && n >= 30) mins = n;
  }
  return mins * 60000;
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

// Số phút từ 0h theo GIỜ VIỆT NAM (server chạy UTC, VN = UTC+7, không có DST).
function vnMinutesOfDay(): number {
  const vn = new Date(Date.now() + 7 * 3600000);
  return vn.getUTCHours() * 60 + vn.getUTCMinutes();
}

// Rule đã tới hạn quét chưa? (cron chạy mỗi 15 phút gọi hàm này cho từng rule)
function isDue(rule: Rule): boolean {
  const interval = intervalMs(rule.frequency);
  const last = rule.last_run_at ? Date.parse(rule.last_run_at) : 0;
  const elapsed = Date.now() - last;

  // Ghim giờ cụ thể (định kỳ, không phải "change"): gửi ĐÚNG GIỜ, không sớm.
  // Khung [target, target+15): bắn ngay từ mốc giờ, trễ tối đa 15' (do cron 15'/lần).
  // Guard chu kỳ (1 lần/ngày...) tránh bắn lặp trong cùng ngày.
  if (rule.frequency !== "change" && rule.run_at && /^\d{1,2}:\d{2}$/.test(rule.run_at)) {
    const [h, m] = rule.run_at.split(":").map(Number);
    const target = h * 60 + m;
    const now = vnMinutesOfDay();
    // Số phút TỪ target tới now theo vòng 24h (xử lý cả mốc gần nửa đêm).
    const diff = (now - target + 1440) % 1440;
    if (diff >= 15) return false; // chỉ trong 15' kể từ giờ hẹn
    return elapsed >= interval - 3600000; // trừ 1h hao để chắc chắn bắt được khung
  }

  // Không ghim giờ: theo chu kỳ thuần (KHÔNG quét sớm — quét sớm sẽ làm trôi tần suất).
  return elapsed >= interval;
}

interface NewsItem {
  title: string;
  content: string;
  details: string;
  ai_summary: string;
  source: string;
  source_url: string;
  sentiment: string;
  is_important: boolean;
  matches_condition: boolean;
  value: string;          // số liệu chính hiện tại (vd "75,2 triệu/lượng", "2.650 USD") — "" nếu chủ đề không có số
  changed: boolean;       // có thay đổi đáng kể so với giá trị lần trước không (dùng để trigger "thay đổi")
}

const SEARCH_SYSTEM =
  `Bạn là AI giám sát tin tức tiếng Việt. Bạn DÙNG Google Search để tìm tin THẬT, MỚI NHẤT.
TUYỆT ĐỐI KHÔNG bịa tin, không bịa số liệu, không bịa URL. Chỉ dùng thông tin từ kết quả tìm được.
Ưu tiên nguồn uy tín (VnExpress, Tuổi Trẻ, Thanh Niên, Dân Trí, CafeF, VietnamNet...).`;

function buildPrompt(rule: Rule): string {
  const hasCond = Boolean(rule.condition && rule.condition.trim());
  const prev = rule.last_value && rule.last_value.trim() ? rule.last_value.trim() : "";
  return `Hãy tìm trên web tin tức MỚI NHẤT (trong vài ngày gần đây) về chủ đề: "${rule.keyword}".
${rule.sources ? `Ưu tiên các nguồn: ${rule.sources}.` : ""}
${hasCond ? `Điều kiện người dùng quan tâm: "${rule.condition}".` : "Người dùng muốn nhận tin mới liên quan."}
${prev ? `Số liệu/giá trị GHI NHẬN LẦN TRƯỚC của chủ đề này: "${prev}". Hãy so sánh với giá trị mới tìm được.` : ""}

Chọn DUY NHẤT 1 bài mới và đáng chú ý NHẤT. Trả về JSON THUẦN (không markdown) là MẢNG đúng 1 phần tử:
{
  "title": "tiêu đề bài báo thật",
  "content": "3-5 câu tóm tắt ĐẦY ĐỦ: chuyện gì xảy ra, số liệu cụ thể (giá, %, mốc thời gian, mức tăng/giảm), bối cảnh chính. Chỉ dùng dữ liệu CÓ THẬT trong bài.",
  "details": "Phân tích chi tiết hơn (3-5 câu): nguyên nhân, diễn biến trước đó, tác động/ý nghĩa, dự báo nếu bài có nêu. Vẫn TUYỆT ĐỐI không bịa số.",
  "ai_summary": "1 câu ngắn ~15 từ chứa điểm mấu chốt kèm số nếu có",
  "source": "tên báo (vd: VnExpress)",
  "source_url": "URL bài viết gốc",
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
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(messages),
    });
  } catch (e) {
    console.log("Push send lỗi:", (e as Error).message);
  }
}

interface MonitorRuleResult {
  inserted: number;
  value?: string; // số liệu mới để lưu làm baseline cho lần sau
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

// Chèn 1 notification + đẩy push. Trả 1 nếu thành công, 0 nếu lỗi.
// deno-lint-ignore no-explicit-any
async function insertNotif(supabase: any, rule: Rule, f: NotifFields): Promise<number> {
  const title = (f.title || "Tin mới").slice(0, 300);
  // deno-lint-ignore no-explicit-any
  const row: Record<string, any> = {
    rule_id: rule.id,
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
  const { data: ins, error } = await supabase.from("notifications")
    .insert([row]).select("id").single();
  if (error || !ins) return 0;
  // Rule "để êm" (muted): vẫn lưu notification để xem trong app, nhưng KHÔNG đẩy push về máy.
  if (!rule.muted) {
    await sendPush(supabase, rule.user_id, title, f.ai_summary || f.content || "", ins.id);
  }
  return 1;
}

// deno-lint-ignore no-explicit-any
async function monitorRule(supabase: any, rule: Rule): Promise<MonitorRuleResult> {
  const hasCond = Boolean(rule.condition && rule.condition.trim());
  // KHÔNG có điều kiện (định kỳ / đặt giờ) → LUÔN gửi 1 tb khi tới hạn, kể cả khi
  // không tìm thấy tin mới. CÓ điều kiện ("theo đk") → chỉ gửi khi thỏa, không thì im.
  const forceSend = !hasCond;
  // Rule "theo điều kiện" + đã có giá trị nền → chỉ báo khi giá trị THỰC SỰ đổi.
  const changeGate = rule.frequency === "change" && Boolean(rule.last_value && rule.last_value.trim());
  const normVal = (s: string) => s.toLowerCase().replace(/\s+/g, "");
  const lastValNorm = normVal(String(rule.last_value ?? ""));

  // Gọi Gemini (lỗi mạng/quota sẽ THROW → caller xử lý; chỉ nuốt lỗi parse).
  const { text, sources } = await geminiGenerate({
    system: SEARCH_SYSTEM,
    user: buildPrompt(rule),
    grounding: true,
    temperature: 0.2,
  });
  const pool: GeminiSource[] = [...sources];
  let items: NewsItem[] = [];
  try {
    const parsed = parseJsonLoose<NewsItem[]>(text);
    if (Array.isArray(parsed)) items = parsed;
  } catch { /* model không trả JSON → coi như không tìm thấy */ }

  // URL đã có (chống trùng) + thông báo gần nhất (để link "trỏ về tb trước").
  const { data: existing } = await supabase
    .from("notifications")
    .select("source_url, created_at")
    .eq("rule_id", rule.id);
  const seen = new Set<string>(
    (existing ?? []).map((n: { source_url: string }) => n.source_url).filter(Boolean)
  );
  const { data: prevRows } = await supabase
    .from("notifications")
    .select("id, title, source, source_url")
    .eq("rule_id", rule.id)
    .order("created_at", { ascending: false })
    .limit(1);
  const prev = prevRows?.[0] as
    { id?: string; title?: string; source?: string; source_url?: string } | undefined;

  const top = items[0];
  let value: string | undefined;
  let inserted = 0;

  // 1) Có tin và VƯỢT các cổng (điều kiện / thay đổi / chống trùng) → gửi tin THẬT.
  if (top) {
    const v = String(top.value ?? "").trim();
    if (v) value = v.slice(0, 200);

    const condOk = !hasCond || toBool(top.matches_condition);
    const changeOk = !changeGate || toBool(top.changed);
    let url = isUrl(top.source_url) ? top.source_url : "";
    if (!url && pool.length > 0) url = pool.shift()!.uri;
    const valueChanged = v !== "" && lastValNorm !== "" && normVal(v) !== lastValNorm;
    const fresh = Boolean(url) && (!seen.has(url) || valueChanged);

    if (condOk && changeOk && fresh) {
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
    }
  }

  // 2) Rule định kỳ/đặt giờ mà CHƯA gửi được tin thật → vẫn PHẢI gửi 1 tb.
  if (inserted === 0 && forceSend) {
    const topic = (rule.keyword || rule.title || "thông tin").slice(0, 60);
    if (prev) {
      // Có tb trước → "tạm thời chưa có thay đổi". KHÔNG có URL bài mới → cho người dùng
      // mở lại THÔNG BÁO TRƯỚC ngay trong app (related_notification_id), thay vì link web.
      inserted += await insertNotif(supabase, rule, {
        title: `Chưa có thay đổi mới: ${topic}`,
        content: "Tạm thời chưa tìm thấy thông tin mới theo yêu cầu — chưa có thay đổi so với thông báo trước. Bạn có thể xem lại thông báo gần nhất bên dưới.",
        details: "",
        ai_summary: "Chưa có thay đổi so với lần trước.",
        source: prev.source || "Web",
        source_url: "",
        related_notification_id: prev.id,
        sentiment: "neutral",
        is_important: false,
      });
    } else if (top) {
      // Chưa có tb nào, nhưng tìm được tin liên quan/gần nhất → gửi như đề xuất.
      let url = isUrl(top.source_url) ? top.source_url : "";
      if (!url && pool.length > 0) url = pool[0].uri;
      inserted += await insertNotif(supabase, rule, {
        title: `Gợi ý liên quan: ${String(top.title ?? topic).slice(0, 120)}`,
        content: `Chưa tìm thấy thông tin đúng yêu cầu của bạn. Đây là thông tin liên quan/mới nhất tìm được:\n${String(top.content ?? "")}`,
        details: String(top.details ?? ""),
        ai_summary: String(top.ai_summary ?? "Thông tin liên quan gần nhất."),
        source: String(top.source ?? "Web"),
        source_url: url,
        sentiment: normSentiment(top.sentiment),
        is_important: false,
      });
    } else {
      // Hoàn toàn không có gì.
      inserted += await insertNotif(supabase, rule, {
        title: `Chưa tìm thấy thông tin: ${topic}`,
        content: "Hiện chưa tìm thấy thông tin nào theo yêu cầu của bạn. Hệ thống sẽ tiếp tục theo dõi và cập nhật ở lần quét kế tiếp.",
        details: "",
        ai_summary: "Chưa tìm thấy thông tin theo yêu cầu.",
        source: "Web",
        source_url: "",
        sentiment: "neutral",
        is_important: false,
      });
    }
  }

  return { inserted, value };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

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
    const { ruleId, userId } = body as { ruleId?: string; userId?: string };

    // manual = bấm "Kiểm tra tin ngay" cho 1 rule → bỏ qua lịch, quét luôn.
    const manual = Boolean(ruleId);

    // Chọn tập rule cần quét. Sắp theo last_run_at TĂNG DẦN (lâu chưa quét / chưa quét
    // lần nào lên trước) để khi nhiều rule + trần MAX_RULES_PER_RUN, mọi rule đều tới
    // lượt theo vòng, không bị "bỏ đói"; rule đặt giờ cũng không bị chen mất khung.
    let query = supabase
      .from("rules")
      .select("*")
      .eq("is_active", true)
      .order("last_run_at", { ascending: true, nullsFirst: true });
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
    if (!rules || rules.length === 0) return json({ inserted: 0, checked: 0 });

    // User thường chỉ được đụng vào rule của mình (chặn ruleId của người khác → 403).
    if (!isAdmin) {
      for (const r of rules as Rule[]) {
        if (r.user_id !== authUserId) {
          return json({ error: "Bạn không có quyền với rule này." }, 403);
        }
      }
    }

    // Ngân sách thời gian: quét tới ~70s thì dừng và trả phần đã làm, tránh nền tảng
    // kill tiến trình (timeout) khi có nhiều rule. Cron/Home gọi lại sẽ quét tiếp.
    const deadline = Date.now() + 70000;
    let inserted = 0;
    let checked = 0;
    let quotaHit = false;
    for (const rule of rules as Rule[]) {
      if (Date.now() > deadline) break;
      if (!manual && checked >= MAX_RULES_PER_RUN) break; // chừa quota; cron lần sau quét tiếp

      // Lịch theo từng rule: chỉ quét khi tới hạn (trừ khi gọi thủ công "Kiểm tra tin ngay").
      if (!manual && !isDue(rule)) continue;

      checked++;
      let newValue: string | undefined;
      try {
        const res = await monitorRule(supabase, rule);
        inserted += res.inserted;
        newValue = res.value;
      } catch (e) {
        console.log(`Rule ${rule.id} lỗi:`, (e as Error).message);
        // Hết quota/quá tải → DỪNG ngay, KHÔNG cập nhật last_run_at để cron lần sau quét lại rule này.
        if (isQuotaErr(e)) {
          quotaHit = true;
          checked--; // rule này coi như chưa quét
          break;
        }
      }
      // Đánh dấu đã quét (kể cả khi không có tin mới) để tính lịch lần sau;
      // cập nhật baseline số liệu nếu lần này tìm được giá trị mới (trigger "thay đổi").
      const upd: Record<string, string> = { last_run_at: new Date().toISOString() };
      if (newValue) upd.last_value = newValue;
      await supabase.from("rules").update(upd).eq("id", rule.id);
    }

    return json({ inserted, checked, quotaHit });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
