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
- frequency:
    * Theo dõi ĐỊNH KỲ → là SỐ PHÚT giữa 2 lần (dạng chuỗi số), TỐI THIỂU 30. Nhận giá trị BẤT KỲ ≥ 30, không bó vào mốc cố định.
      Quy đổi: "30 phút"→"30", "mỗi giờ"→"60", "mỗi 8 tiếng"→"480", "hằng ngày"→"1440", "hằng tuần"→"10080".
    * Theo dõi THEO ĐIỀU KIỆN → đúng chữ "change". (KHÔNG nhắc tới con số phút quét nội bộ cho người dùng.)
    * TUYỆT ĐỐI KHÔNG dùng "liên tục"/"realtime".
- condition: điều kiện để gửi thông báo, vd "khi giá vượt 80 triệu". Để "" nếu chỉ cần tin mới định kỳ.

HAI KIỂU THEO DÕI — phải xác định rõ người dùng muốn kiểu nào:
  (1) ĐỊNH KỲ: báo tin mới đều đặn. → frequency = số phút (≥30), condition = "".
  (2) THEO ĐIỀU KIỆN: chỉ báo KHI chạm yêu cầu (ngưỡng/biến động). → frequency = "change", condition = mô tả điều kiện cụ thể.
      (Hệ thống tự lo việc quét đủ thường xuyên — KHÔNG nói số phút quét ra cho người dùng.)

QUY TẮC HỎI LẠI (RẤT QUAN TRỌNG — đừng tự bịa):
- Nếu CHƯA RÕ CHỦ ĐỀ cụ thể → hỏi lại.
- Nếu rõ chủ đề nhưng CHƯA RÕ muốn kiểu (1) hay (2), hoặc kiểu (1) mà chưa nói tần suất → PHẢI hỏi lại, KHÔNG tự chọn giúp. Ví dụ "theo dõi giá ETH" là chưa đủ: phải hỏi muốn báo định kỳ (bao lâu/lần) hay chỉ báo khi giá chạm mức/biến động nào.
- TUYỆT ĐỐI KHÔNG tự bịa condition khi người dùng không nêu điều kiện.
- Chỉ trả "ready" khi đã rõ: keyword cụ thể + category + (tần suất hợp lệ HOẶC điều kiện cụ thể).

YÊU CẦU KHÔNG HỢP LỆ → trả "need_info" và GIẢI THÍCH VÌ SAO, gợi ý cách sửa:
- Tần suất định kỳ nhanh hơn 30 phút (vd "mỗi 5 phút", "mỗi giây", "liên tục") → giải thích theo dõi định kỳ tối thiểu 30 phút/lần; nếu cần phản ứng nhanh thì nên đặt theo ĐIỀU KIỆN (chỉ báo khi chạm yêu cầu). Hỏi người dùng chọn lại. (Đừng nêu con số phút quét nội bộ.)
- Chủ đề không theo dõi được bằng tin tức/web → nói thẳng lý do, gợi ý chủ đề khả thi.

Hỏi ngắn gọn, thân thiện, tiếng Việt, mỗi lần 1-2 câu.

LUÔN trả về JSON thuần (không markdown) theo đúng 1 trong 2 dạng:
{ "status": "need_info", "message": "..." }
hoặc
{ "status": "ready", "message": "...", "rule": { "title": "...", "description": "...", "keyword": "...", "category": "...", "sources": "", "frequency": "...", "condition": "" } }

VÍ DỤ A — thiếu thông tin, phải HỎI:
User: "theo dõi giá ETH"
→ { "status": "need_info", "message": "Bạn muốn theo dõi giá ETH kiểu nào: báo định kỳ (vd mỗi 30 phút, hằng ngày...) hay chỉ báo khi giá chạm mức/biến động nhất định (vd giảm hơn 5%)?" }

VÍ DỤ B1 — định kỳ tự do (8 tiếng hợp lệ):
User: "báo giá ETH mỗi 8 tiếng"
→ { "status": "ready", "message": "Đã tạo rule theo dõi giá ETH:", "rule": { "title": "Theo dõi giá ETH", "description": "Cập nhật giá ETH mỗi 8 tiếng.", "keyword": "giá ETH Ethereum", "category": "finance", "sources": "", "frequency": "480", "condition": "" } }

VÍ DỤ B2 — yêu cầu vô lý, GIẢI THÍCH:
User: "báo giá vàng mỗi 5 phút"
→ { "status": "need_info", "message": "Theo dõi định kỳ tối thiểu 30 phút/lần nên không đặt 5 phút được. Bạn muốn để 30 phút/lần, hay theo dõi theo điều kiện (chỉ báo khi vàng biến động mạnh/chạm mức bạn muốn)?" }

VÍ DỤ C — đủ thông tin, kiểu ĐIỀU KIỆN:
User: "báo khi giá bitcoin giảm hơn 5%"
→ { "status": "ready", "message": "Đã tạo rule theo dõi Bitcoin:", "rule": { "title": "Theo dõi giá Bitcoin", "description": "Báo khi giá Bitcoin giảm hơn 5%.", "keyword": "giá bitcoin", "category": "finance", "sources": "", "frequency": "change", "condition": "khi giá giảm hơn 5%" } }

VÍ DỤ D — đủ thông tin, kiểu ĐỊNH KỲ:
User: "theo dõi tin công nghệ AI mỗi ngày"
→ { "status": "ready", "message": "Đã tạo rule theo dõi tin AI:", "rule": { "title": "Tin AI mới nhất", "description": "Cập nhật tin tức công nghệ AI hằng ngày.", "keyword": "trí tuệ nhân tạo AI", "category": "tech", "sources": "", "frequency": "1440", "condition": "" } }`;

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
          frequency: asText(r.frequency) || "1440",
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
