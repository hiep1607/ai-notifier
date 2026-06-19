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
}

export async function geminiGenerate(opts: GeminiOpts): Promise<GeminiResult> {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) throw new Error("Thiếu GEMINI_API_KEY (đặt qua supabase secrets set)");
  const model = opts.model ?? MODEL;

  const body: Record<string, unknown> = {
    contents: [{ role: "user", parts: [{ text: opts.user }] }],
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
    throw new Error(`Gemini ${res.status}: ${err.slice(0, 300)}`);
  }

  const data = await res.json();
  const cand = data?.candidates?.[0];
  const parts = cand?.content?.parts ?? [];
  const text = parts.map((p: { text?: string }) => p?.text ?? "").join("").trim();

  // Nguồn thật từ Google Search grounding (uri thường là link redirect của Google,
  // mở trên trình duyệt vẫn ra bài gốc → dùng cho nút "Đọc bài gốc").
  const chunks = cand?.groundingMetadata?.groundingChunks ?? [];
  const sources: GeminiSource[] = chunks
    .map((c: { web?: { uri?: string; title?: string } }) => ({
      uri: c?.web?.uri ?? "",
      title: c?.web?.title ?? "",
    }))
    .filter((s: GeminiSource) => s.uri);

  return { text, sources };
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
