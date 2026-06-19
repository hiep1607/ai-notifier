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
  keyword: string;
  category?: string;
  sources?: string;
  condition?: string;
  frequency?: string;
  last_run_at?: string | null;
  is_active: boolean;
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
}

const SEARCH_SYSTEM =
  `Bạn là AI giám sát tin tức tiếng Việt. Bạn DÙNG Google Search để tìm tin THẬT, MỚI NHẤT.
TUYỆT ĐỐI KHÔNG bịa tin, không bịa số liệu, không bịa URL. Chỉ dùng thông tin từ kết quả tìm được.
Ưu tiên nguồn uy tín (VnExpress, Tuổi Trẻ, Thanh Niên, Dân Trí, CafeF, VietnamNet...).`;

function buildPrompt(rule: Rule): string {
  const hasCond = Boolean(rule.condition && rule.condition.trim());
  return `Hãy tìm trên web tin tức MỚI NHẤT (trong vài ngày gần đây) về chủ đề: "${rule.keyword}".
${rule.sources ? `Ưu tiên các nguồn: ${rule.sources}.` : ""}
${hasCond ? `Điều kiện người dùng quan tâm: "${rule.condition}".` : "Người dùng muốn nhận tin mới liên quan."}

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
  "matches_condition": ${hasCond ? "true nếu bài THẬT SỰ cho thấy điều kiện đã xảy ra, ngược lại false" : "true"}
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

// deno-lint-ignore no-explicit-any
async function monitorRule(supabase: any, rule: Rule): Promise<number> {
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
    return 0; // model không trả JSON hợp lệ → bỏ qua lần này
  }
  if (!Array.isArray(items) || items.length === 0) return 0;

  // URL grounding thật để vá những item model bỏ trống/bịa source_url.
  const pool: GeminiSource[] = [...sources];
  const hasCond = Boolean(rule.condition && rule.condition.trim());

  // Lấy URL đã có để chống trùng.
  const { data: existing } = await supabase
    .from("notifications")
    .select("source_url")
    .eq("rule_id", rule.id);
  const seen = new Set<string>(
    (existing ?? []).map((n: { source_url: string }) => n.source_url).filter(Boolean)
  );

  let inserted = 0;
  for (const it of items.slice(0, MAX_PER_RUN)) {
    // Bỏ tin không thỏa điều kiện (trigger "match").
    if (hasCond && !toBool(it.matches_condition)) continue;

    let url = isUrl(it.source_url) ? it.source_url : "";
    if (!url && pool.length > 0) url = pool.shift()!.uri; // vá bằng nguồn grounding
    if (!url || seen.has(url)) continue;
    seen.add(url);

    const { error } = await supabase.from("notifications").insert([{
      rule_id: rule.id,
      title: String(it.title ?? "").slice(0, 300) || "Tin mới",
      content: String(it.content ?? ""),
      details: String(it.details ?? ""),
      ai_summary: String(it.ai_summary ?? ""),
      source: String(it.source ?? "Web"),
      source_url: url,
      category: rule.category ?? "news",
      sentiment: normSentiment(it.sentiment),
      is_important: toBool(it.is_important),
      is_read: false,
    }]);
    if (!error) inserted++;
  }

  return inserted;
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

    // Chọn tập rule cần quét.
    let query = supabase.from("rules").select("*").eq("is_active", true);
    if (ruleId) query = supabase.from("rules").select("*").eq("id", ruleId);
    else if (userId) query = query.eq("user_id", userId);

    const { data: rules, error } = await query;
    if (error) return json({ error: error.message }, 500);
    if (!rules || rules.length === 0) return json({ inserted: 0, checked: 0 });

    // Ngân sách thời gian: quét tới ~70s thì dừng và trả phần đã làm, tránh nền tảng
    // kill tiến trình (timeout) khi có nhiều rule. Cron/Home gọi lại sẽ quét tiếp.
    const deadline = Date.now() + 70000;
    let inserted = 0;
    let checked = 0;
    for (const rule of rules as Rule[]) {
      if (Date.now() > deadline) break;

      // Lịch theo từng rule: chỉ quét khi tới hạn theo frequency (trừ khi gọi thủ công).
      if (!manual && rule.last_run_at) {
        const elapsed = Date.now() - Date.parse(rule.last_run_at);
        if (elapsed < intervalMs(rule.frequency)) continue;
      }

      checked++;
      try {
        inserted += await monitorRule(supabase, rule);
      } catch (e) {
        console.log(`Rule ${rule.id} lỗi:`, (e as Error).message);
      }
      // Đánh dấu đã quét (kể cả khi không có tin mới) để tính lịch lần sau.
      await supabase
        .from("rules")
        .update({ last_run_at: new Date().toISOString() })
        .eq("id", rule.id);
    }

    return json({ inserted, checked });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
