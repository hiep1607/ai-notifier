// Gọi local Ollama model — không cần API key, chạy offline
// Đổi MODEL hoặc OLLAMA_URL nếu cần

const OLLAMA_URL = "http://localhost:11434/api/chat";
// Model 3B vừa với GPU 4GB VRAM (RTX 3050 Laptop). Bản 7B gây CUDA OOM/crash.
const MODEL = "qwen2.5:3b-instruct";

interface ChatTurn {
  role: "system" | "user" | "assistant";
  content: string;
}

async function callOllama(messages: ChatTurn[]): Promise<string> {
  const res = await fetch(OLLAMA_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      stream: false,
      think: false, // tắt thinking để response nhanh hơn và dễ parse JSON
      format: "json", // ép Ollama trả JSON hợp lệ
      messages,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Ollama ${res.status}: ${err}`);
  }

  const json = await res.json();
  return json.message?.content ?? "";
}

// Ép về chuỗi: model nhỏ đôi khi trả mảng cho sources → join lại
function asText(v: any): string {
  if (Array.isArray(v)) return v.join(", ");
  if (v == null) return "";
  return String(v);
}

function parseJson(raw: string): any {
  // Loại bỏ markdown code fence nếu model wrap JSON trong ```
  const clean = raw.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
  // Tìm JSON object đầu tiên trong chuỗi (đề phòng model thêm text thừa)
  const match = clean.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`Không parse được JSON từ: ${raw.slice(0, 200)}`);
  return JSON.parse(match[0]);
}

// ===== TẠO RULE (multi-turn, hỏi lại khi thiếu thông tin) =====

export interface RuleDraft {
  title: string;
  description: string;
  keyword: string;
  category: string;   // key trong CATEGORIES
  sources: string;
  frequency: string;  // key trong FREQUENCIES
  condition: string;
}

export type RuleAIResult =
  | { status: "need_info"; message: string }
  | { status: "ready"; message: string; rule: RuleDraft };

const RULE_SYSTEM = `Bạn là trợ lý tạo "rule theo dõi thông tin tự động" cho một app thông báo.
Nhiệm vụ: qua hội thoại, thu thập đủ thông tin để dựng 1 rule hoàn chỉnh.

Một rule hoàn chỉnh gồm các trường:
- title: tên ngắn gọn (tối đa 6 từ), KHÔNG được để trống
- description: 1 câu mô tả rule làm gì
- keyword: từ khóa tìm kiếm chính (1-5 từ)
- category: PHẢI là 1 trong: finance, news, tech, sports, weather, health, other
- sources: 1 CHUỖI text các nguồn cách nhau dấu phẩy, vd "VnExpress, CafeF". KHÔNG dùng mảng. Để "" nếu không rõ.
- frequency: PHẢI là 1 trong: realtime, hourly, daily, weekly
- condition: điều kiện để gửi thông báo, vd "khi giá vượt 80 triệu". Để "" nếu chỉ cần tin mới.

QUY TẮC HỎI LẠI (rất quan trọng):
- Nếu yêu cầu quá chung chung / mơ hồ (vd chỉ nói "tin tức", "thời tiết", "thể thao" mà chưa rõ CHỦ ĐỀ CỤ THỂ hoặc TẦN SUẤT), thì PHẢI trả về status "need_info" và hỏi lại, KHÔNG được tự bịa rule.
- Chỉ trả "ready" khi đã rõ: chủ đề cụ thể (keyword), category, và frequency.
- Hỏi ngắn gọn, thân thiện, tiếng Việt, mỗi lần 1-2 câu.

LUÔN trả về JSON thuần (không markdown) theo đúng 1 trong 2 dạng.

VÍ DỤ 1 — yêu cầu mơ hồ:
User: "theo dõi tin tức"
Trả về: { "status": "need_info", "message": "Bạn muốn theo dõi tin tức về chủ đề gì cụ thể (vd: kinh tế, thể thao, công nghệ...) và muốn cập nhật bao lâu một lần?" }

VÍ DỤ 2 — đủ thông tin:
User: "báo khi giá bitcoin tăng mạnh, kiểm tra mỗi giờ"
Trả về: { "status": "ready", "message": "Tôi đã tạo rule theo dõi Bitcoin cho bạn:", "rule": { "title": "Theo dõi giá Bitcoin", "description": "Báo khi giá Bitcoin tăng mạnh, kiểm tra mỗi giờ.", "keyword": "giá bitcoin", "category": "finance", "sources": "", "frequency": "hourly", "condition": "khi giá tăng mạnh bất thường" } }`;

// history: toàn bộ lượt user/assistant trước đó (không gồm system)
export async function chatRule(history: ChatTurn[]): Promise<RuleAIResult> {
  const raw = await callOllama([
    { role: "system", content: RULE_SYSTEM },
    ...history,
  ]);
  const data = parseJson(raw);

  if (data.status === "ready" && data.rule) {
    const r = data.rule;
    return {
      status: "ready",
      message: data.message ?? "Đây là rule tôi đề xuất:",
      rule: {
        title: asText(r.title),
        description: asText(r.description),
        keyword: asText(r.keyword),
        category: asText(r.category) || "other",
        sources: asText(r.sources),
        frequency: asText(r.frequency) || "daily",
        condition: asText(r.condition),
      },
    };
  }

  return {
    status: "need_info",
    message: data.message ?? "Bạn có thể cho tôi biết thêm chi tiết không?",
  };
}

// ===== TÓM TẮT BÀI VIẾT THẬT =====
// AI đọc 1 bài THẬT (tiêu đề + mô tả ngắn từ RSS) rồi tóm tắt — KHÔNG bịa thông tin.

export interface ArticleSummary {
  content: string;     // 2-3 câu tóm tắt dễ đọc, dựa trên bài thật
  ai_summary: string;  // 1 câu ngắn (~15 từ)
  sentiment: string;   // positive | neutral | negative
  is_important: boolean;
}

export async function summarizeArticle(
  article: { title: string; snippet: string; source: string },
  rule: { keyword: string; condition?: string }
): Promise<ArticleSummary> {
  const raw = await callOllama([
    {
      role: "system",
      content: `Bạn là AI giám sát tin tức. Bạn nhận được 1 bài báo THẬT (tiêu đề + mô tả ngắn).
Nhiệm vụ: tóm tắt lại bằng tiếng Việt tự nhiên, dễ đọc.

QUAN TRỌNG: CHỈ dựa vào thông tin được cung cấp, TUYỆT ĐỐI KHÔNG bịa thêm số liệu, sự kiện hay chi tiết không có trong bài.

Trả về JSON thuần đúng 4 trường:
{
  "content": "tóm tắt 2-3 câu nội dung chính của bài",
  "ai_summary": "tóm tắt 1 câu thật ngắn (~15 từ)",
  "sentiment": "1 trong: positive, neutral, negative",
  "is_important": true/false
}
- is_important = true nếu bài có biến động lớn/bất thường/khẩn cấp, hoặc khớp điều kiện người dùng quan tâm.
Chỉ trả về JSON thuần, không markdown, không giải thích.`,
    },
    {
      role: "user",
      content: `Từ khóa người dùng theo dõi: "${rule.keyword}"
Điều kiện đáng chú ý: "${rule.condition ?? ""}"

BÀI BÁO THẬT:
Nguồn: ${article.source}
Tiêu đề: ${article.title}
Mô tả: ${article.snippet}

Hãy tóm tắt bài này.`,
    },
  ]);

  const d = parseJson(raw);
  return {
    content: asText(d.content) || article.snippet,
    ai_summary: asText(d.ai_summary) || article.title,
    sentiment: asText(d.sentiment) || "neutral",
    is_important: d.is_important ?? false,
  };
}
