// Lớp gọi Gemini (Google AI Studio) cho Edge Functions — thay cho Ollama local.
// Key lấy từ env GEMINI_API_KEY (Supabase secret), KHÔNG bao giờ lộ ra client.
//
// Hỗ trợ 2 chế độ:
//  - json:true        → ép trả JSON thuần (dùng cho NL→Rule). KHÔNG kèm grounding.
//  - grounding:true   → bật Google Search để model tự tìm tin THẬT trên web,
//                       trả kèm danh sách nguồn (sources). Không ép JSON được khi
//                       bật tool → ta tự parse JSON từ text trong prompt.

const MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-2.5-flash";
const ENDPOINT = (model: string, key: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

export interface GeminiSource {
  title: string;
  uri: string;
}

export interface GeminiResult {
  text: string;
  sources: GeminiSource[];
  // Model THẬT SỰ đã trả lời (sau fallback) — để ghi usage_logs theo bucket.
  model: string;
}

interface GeminiOpts {
  system?: string;
  user: string;
  json?: boolean;
  grounding?: boolean;
  temperature?: number;
  timeoutMs?: number;
  // Cho phép chọn model riêng theo task (vd generate-rule dùng flash-lite rẻ hơn,
  // run-monitor giữ flash để có grounding tốt). Mặc định = GEMINI_MODEL.
  model?: string;
  // QUOTA NGÀY tính RIÊNG TỪNG MODEL (quotaId ...PerModel...). Model chính cạn lượt
  // ngày → tự thử lần lượt các model này (bucket khác, vẫn free). 2026-07: Google siết
  // flash-lite free còn 20 lượt/ngày nên fallback là bắt buộc để app sống cả ngày.
  fallbackModels?: string[];
  // Âm thanh đính kèm (base64) — dùng cho chuyển giọng nói thành văn bản (transcribe).
  audio?: { data: string; mime: string };
}

// Chuỗi bucket cho task QUÉT NỀN (rẻ trước, cạn thì leo dần lên).
export const CHEAP_FALLBACK = ["gemini-2.0-flash-lite", "gemini-2.0-flash", "gemini-2.5-flash"];
// Chuỗi cho task HƯỚNG NGƯỜI DÙNG (tạo rule — chất lượng trước, cạn thì hạ dần).
export const SMART_FALLBACK = ["gemini-2.0-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash-lite"];

// 429 có 2 loại RẤT khác nhau: (a) chạm giới hạn TỐC ĐỘ mỗi phút (vd flash-lite free
// 20 lượt/phút) — Gemini kèm "Please retry in Xs", chờ X giây là chạy tiếp, quota ngày
// vẫn còn; (b) hết quota NGÀY — không có gợi ý retry ngắn. Loại (a) tự hấp thụ ở đây:
// chờ đúng X giây rồi thử lại 1 lần, các caller không thấy lỗi.
function rateLimitDelayMs(errText: string): number | null {
  const m = errText.match(/retry in (\d+(?:\.\d+)?)\s*s/i);
  if (!m) return null;
  const sec = parseFloat(m[1]);
  return sec > 0 && sec <= 30 ? Math.ceil((sec + 1) * 1000) : null;
}

// Hết quota NGÀY của 1 model (quotaId ...PerDay...) / model không tồn tại → đáng thử
// model kế tiếp trong chuỗi. Lỗi khác (mạng, 5xx, quota phút đã retry) thì ném luôn.
const DAY_QUOTA_RE = /per\s*day|perday/i;
const MODEL_GONE_RE = /Gemini 404|NOT_FOUND|is not found/i;

export async function geminiGenerate(opts: GeminiOpts): Promise<GeminiResult> {
  const chain = [opts.model ?? MODEL, ...(opts.fallbackModels ?? [])];
  let lastErr: unknown = null;
  for (const model of chain) {
    try {
      return await onceWithRateRetry({ ...opts, model });
    } catch (e) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : String(e);
      if (DAY_QUOTA_RE.test(msg) || MODEL_GONE_RE.test(msg)) continue; // bucket kế tiếp
      throw e;
    }
  }
  throw lastErr;
}

// Trần TỐC ĐỘ mỗi phút: chờ đúng X giây (≤30) rồi thử lại 1 lần — CÙNG model.
async function onceWithRateRetry(opts: GeminiOpts): Promise<GeminiResult> {
  try {
    return await geminiOnce(opts);
  } catch (e) {
    const wait = rateLimitDelayMs(e instanceof Error ? e.message : String(e));
    if (wait === null) throw e; // lỗi thật (hết quota ngày / 5xx / mạng) → caller xử lý
    await new Promise((r) => setTimeout(r, wait));
    return await geminiOnce(opts);
  }
}

async function geminiOnce(opts: GeminiOpts): Promise<GeminiResult> {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) throw new Error("Thiếu GEMINI_API_KEY (đặt qua supabase secrets set)");
  const model = opts.model ?? MODEL;

  // Audio (nếu có) đứng TRƯỚC text — đúng khuyến nghị Gemini cho media + câu lệnh.
  const parts: Record<string, unknown>[] = [];
  if (opts.audio) {
    parts.push({ inline_data: { mime_type: opts.audio.mime, data: opts.audio.data } });
  }
  parts.push({ text: opts.user });

  const body: Record<string, unknown> = {
    contents: [{ role: "user", parts }],
    generationConfig: {
      temperature: opts.temperature ?? 0.3,
      // Chỉ ép JSON khi KHÔNG dùng tool grounding (Gemini không cho kết hợp).
      ...(opts.json && !opts.grounding ? { responseMimeType: "application/json" } : {}),
    },
  };

  if (opts.system) {
    body.systemInstruction = { parts: [{ text: opts.system }] };
  }
  if (opts.grounding) {
    body.tools = [{ google_search: {} }];
  }

  // Timeout cho 1 lượt gọi Gemini — tránh 1 request chậm treo cả hàm tới mức nền tảng kill.
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 60000);
  let res: Response;
  try {
    res = await fetch(ENDPOINT(model, key), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(t);
  }

  if (!res.ok) {
    const err = await res.text();
    // Rút quotaId (…PerDay… / …PerMinute…) lên ĐẦU message — body lỗi dài, cắt 800
    // ký tự hay làm mất quotaId ở cuối khiến caller phân loại nhầm loại 429
    // (2026-07-08: hết quota NGÀY mà generate-rule vẫn bảo "chạm trần mỗi phút").
    let tag = "";
    try {
      const j = JSON.parse(err) as {
        error?: { details?: { violations?: { quotaId?: string }[] }[] };
      };
      const ids = (j.error?.details ?? [])
        .flatMap((d) => d.violations ?? [])
        .map((v) => v.quotaId)
        .filter(Boolean);
      if (ids.length) tag = ` [quotaId: ${ids.join(",")}]`;
    } catch {
      // body không phải JSON → thôi, giữ nguyên
    }
    throw new Error(`Gemini ${res.status}${tag}: ${err.slice(0, 800)}`);
  }

  const data = await res.json();
  const cand = data?.candidates?.[0];
  // LƯU Ý: không đặt tên `parts` — trùng với mảng parts của REQUEST ở đầu hàm.
  // Chính vụ trùng tên này (thêm 2026-07-05 khi làm audio) là SyntaxError làm MỌI
  // function import gemini.ts BOOT_ERROR khi deploy lại (phát hiện 2026-07-08).
  const outParts = cand?.content?.parts ?? [];
  const text = outParts.map((p: { text?: string }) => p?.text ?? "").join("").trim();

  // Nguồn thật từ Google Search grounding (uri thường là link redirect của Google,
  // mở trên trình duyệt vẫn ra bài gốc → dùng cho nút "Đọc bài gốc").
  const chunks = cand?.groundingMetadata?.groundingChunks ?? [];
  const sources: GeminiSource[] = chunks
    .map((c: { web?: { uri?: string; title?: string } }) => ({
      uri: c?.web?.uri ?? "",
      title: c?.web?.title ?? "",
    }))
    .filter((s: GeminiSource) => s.uri);

  return { text, sources, model };
}

// Tách JSON đầu tiên trong text (model đôi khi thêm chữ thừa quanh JSON).
export function parseJsonLoose<T = unknown>(raw: string): T {
  const clean = raw.replace(/```json?/gi, "").replace(/```/g, "").trim();
  // Thử object trước, rồi tới array.
  const obj = clean.match(/\{[\s\S]*\}/);
  const arr = clean.match(/\[[\s\S]*\]/);
  const pick = obj && (!arr || obj.index! <= arr.index!) ? obj[0] : arr?.[0];
  if (!pick) throw new Error(`Không parse được JSON từ: ${raw.slice(0, 200)}`);
  return JSON.parse(pick) as T;
}
