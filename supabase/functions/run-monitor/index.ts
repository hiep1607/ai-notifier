// Edge Function: giám sát tin THẬT bằng Gemini + Google Search grounding.
// Gemini tự tìm tin mới nhiều nguồn theo keyword/điều kiện của rule → trả JSON →
// chống trùng theo source_url → insert vào notifications (dùng service role, bỏ qua RLS).
//
// Gọi được 3 cách:
//  - { ruleId }  : 1 rule (nút "Kiểm tra tin ngay")
//  - { userId }  : mọi rule active của 1 user (khi mở app)
//  - {}          : MỌI rule active (pg_cron chạy nền 24/7)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";
import { geminiGenerate, parseJsonLoose, GeminiSource } from "../_shared/gemini.ts";

const MAX_PER_RUN = 1; // mỗi lần quét 1 rule chỉ tạo 1 thông báo (tin mới/đáng chú ý nhất)
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
  is_active: boolean;
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

  // Ghim giờ cụ thể (định kỳ, không phải "change"): quét trong khung [target-15, target+15)
  // — tức ĐÃ tới giờ HOẶC SẮP tới trong 15 phút (cron 15' kế tiếp có thể lỡ) → bắn sát giờ.
  // Guard chu kỳ (1 lần/ngày...) tránh bắn lặp dù khung rộng 30'.
  if (rule.frequency !== "change" && rule.run_at && /^\d{1,2}:\d{2}$/.test(rule.run_at)) {
    const [h, m] = rule.run_at.split(":").map(Number);
    const target = h * 60 + m;
    const now = vnMinutesOfDay();
    // Số phút TỪ target tới now theo vòng 24h (xử lý cả mốc gần nửa đêm).
    const diff = (now - target + 1440) % 1440;
    const inWindow = diff < 15 || diff >= 1440 - 15; // 15' sau target hoặc 15' trước target
    if (!inWindow) return false;
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
Nếu không tìm thấy tin liên quan, trả về mảng rỗng []. Chỉ trả JSON, không giải thích.`;
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

// deno-lint-ignore no-explicit-any
async function monitorRule(supabase: any, rule: Rule): Promise<MonitorRuleResult> {
  const { text, sources } = await geminiGenerate({
    system: SEARCH_SYSTEM,
    user: buildPrompt(rule),
    grounding: true,
    temperature: 0.2,
  });

  let items: NewsItem[];
  try {
    items = parseJsonLoose<NewsItem[]>(text);
  } catch {
    return { inserted: 0 }; // model không trả JSON hợp lệ → bỏ qua lần này
  }
  if (!Array.isArray(items) || items.length === 0) return { inserted: 0 };

  // URL grounding thật để vá những item model bỏ trống/bịa source_url.
  const pool: GeminiSource[] = [...sources];
  const hasCond = Boolean(rule.condition && rule.condition.trim());
  // Rule "theo điều kiện" + đã có giá trị nền → chỉ báo khi giá trị THỰC SỰ đổi.
  const changeGate = rule.frequency === "change" && Boolean(rule.last_value && rule.last_value.trim());
  // So sánh số liệu lỏng (bỏ khoảng trắng + thường hóa) để biết có đổi so với lần trước không.
  const normVal = (s: string) => s.toLowerCase().replace(/\s+/g, "");
  const lastValNorm = normVal(String(rule.last_value ?? ""));

  // Lấy URL đã có để chống trùng.
  const { data: existing } = await supabase
    .from("notifications")
    .select("source_url")
    .eq("rule_id", rule.id);
  const seen = new Set<string>(
    (existing ?? []).map((n: { source_url: string }) => n.source_url).filter(Boolean)
  );

  let inserted = 0;
  let value: string | undefined;
  for (const it of items.slice(0, MAX_PER_RUN)) {
    // Ghi nhận số liệu mới (kể cả khi không báo) để cập nhật baseline.
    const v = String(it.value ?? "").trim();
    if (v) value = v.slice(0, 200);

    // Bỏ tin không thỏa điều kiện (trigger "match").
    if (hasCond && !toBool(it.matches_condition)) continue;
    // Bỏ tin không có thay đổi đáng kể so với lần trước (trigger "thay đổi").
    if (changeGate && !toBool(it.changed)) continue;

    let url = isUrl(it.source_url) ? it.source_url : "";
    if (!url && pool.length > 0) url = pool.shift()!.uri; // vá bằng nguồn grounding
    if (!url) continue; // không có nguồn → bỏ
    // Chống trùng: bỏ qua khi CÙNG URL mà số liệu KHÔNG đổi (không có gì mới để báo).
    // Chủ đề kiểu giá-trị (thời tiết/giá): URL nguồn đứng yên nhưng số đổi → vẫn báo.
    // CHỈ coi là "đã đổi" khi CÓ mốc cũ (lastValNorm) để so; không có mốc thì không tự
    // nhận đã đổi (tránh báo lặp mỗi phiên khi chưa có cột last_value) → để điều kiện rule
    // và dedup theo URL quyết định.
    const valueChanged = v !== "" && lastValNorm !== "" && normVal(v) !== lastValNorm;
    if (seen.has(url) && !valueChanged) continue;
    seen.add(url);

    const title = String(it.title ?? "").slice(0, 300) || "Tin mới";
    const { data: ins, error } = await supabase.from("notifications").insert([{
      rule_id: rule.id,
      title,
      content: String(it.content ?? ""),
      details: String(it.details ?? ""),
      ai_summary: String(it.ai_summary ?? ""),
      source: String(it.source ?? "Web"),
      source_url: url,
      category: rule.category ?? "news",
      sentiment: normSentiment(it.sentiment),
      is_important: toBool(it.is_important),
      is_read: false,
    }]).select("id").single();

    if (!error && ins) {
      inserted++;
      // Báo đẩy tới thiết bị của chủ rule (nếu đã đăng ký push).
      await sendPush(supabase, rule.user_id, title, String(it.ai_summary ?? it.content ?? ""), ins.id);
    }
  }

  return { inserted, value };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

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
    if (ruleId) query = supabase.from("rules").select("*").eq("id", ruleId);
    else if (userId) {
      query = query.eq("user_id", userId);
    }

    const { data: rules, error } = await query;
    if (error) return json({ error: error.message }, 500);
    if (!rules || rules.length === 0) return json({ inserted: 0, checked: 0 });

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
