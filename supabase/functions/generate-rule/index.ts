// Edge Function: NL → Rule (multi-turn). Thay chatRule chạy Ollama local trước đây.
// Client gọi: supabase.functions.invoke("generate-rule", { body: { history } })
// history: [{ role: "user"|"assistant", content: string }, ...]

import { corsHeaders, json } from "../_shared/cors.ts";
import { geminiGenerate, parseJsonLoose } from "../_shared/gemini.ts";

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

LUÔN trả về JSON thuần (không markdown) theo đúng 1 trong 2 dạng:
{ "status": "need_info", "message": "..." }
hoặc
{ "status": "ready", "message": "...", "rule": { "title": "...", "description": "...", "keyword": "...", "category": "...", "sources": "", "frequency": "...", "condition": "" } }`;

function asText(v: unknown): string {
  if (Array.isArray(v)) return v.join(", ");
  if (v == null) return "";
  return String(v);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { history } = await req.json();
    if (!Array.isArray(history) || history.length === 0) {
      return json({ error: "Thiếu history" }, 400);
    }

    // Gom hội thoại thành 1 prompt (model nhỏ task này không cần multi-turn API).
    const convo = history
      .map((m: { role: string; content: string }) =>
        `${m.role === "user" ? "Người dùng" : "Trợ lý"}: ${m.content}`
      )
      .join("\n");

    const { text } = await geminiGenerate({
      system: RULE_SYSTEM,
      user: `${convo}\n\nDựa trên hội thoại trên, trả về JSON đúng định dạng.`,
      json: true,
      temperature: 0.3,
    });

    const data = parseJsonLoose<Record<string, unknown>>(text);

    if (data.status === "ready" && data.rule) {
      const r = data.rule as Record<string, unknown>;
      return json({
        status: "ready",
        message: asText(data.message) || "Đây là rule tôi đề xuất:",
        rule: {
          title: asText(r.title),
          description: asText(r.description),
          keyword: asText(r.keyword),
          category: asText(r.category) || "other",
          sources: asText(r.sources),
          frequency: asText(r.frequency) || "daily",
          condition: asText(r.condition),
        },
      });
    }

    return json({
      status: "need_info",
      message: asText(data.message) || "Bạn có thể cho tôi biết thêm chi tiết không?",
    });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
