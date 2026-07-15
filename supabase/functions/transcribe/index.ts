// Edge Function: chuyển GIỌNG NÓI thành văn bản bằng Gemini flash-lite (không grounding,
// không đụng quota 1.500/ngày của search). Dùng cho ô nhập tạo rule trên MOBILE —
// Expo Go không có SpeechRecognition; web dùng Web Speech API của trình duyệt (0 quota,
// không gọi hàm này).
//
// Bảo mật: BẮT BUỘC JWT đăng nhập (anon/không token → 401) — không cho người lạ đốt
// quota Gemini qua endpoint công khai. Trần dung lượng audio để không bị dội payload to.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";
import { CHEAP_FALLBACK, geminiGenerate } from "../_shared/gemini.ts";
import { enforceRateLimits } from "../_shared/rateLimit.ts";

// ~4MB base64 ≈ 3MB audio ≈ 5-6 phút AAC 64kbps — mô tả rule bằng miệng thì quá đủ.
const MAX_AUDIO_BASE64 = 4_000_000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "Cần đăng nhập để dùng nhập liệu giọng nói." }, 401);
    const { data: u, error: uErr } = await supabase.auth.getUser(token);
    if (uErr || !u?.user) return json({ error: "Phiên đăng nhập không hợp lệ." }, 401);

    const rate = await enforceRateLimits(
      supabase,
      u.user.id,
      "transcribe",
      { limit: 8, seconds: 600 },
      30,
    );
    if (!rate.allowed) {
      return json(
        { error: "Bạn đã dùng nhập liệu giọng nói quá nhiều lần. Vui lòng thử lại sau.", retry_after: rate.retryAfterSeconds },
        429,
        { "Retry-After": String(rate.retryAfterSeconds) },
      );
    }

    const body = await req.json().catch(() => ({}));
    const audio = String(body?.audio ?? "");
    const mime = String(body?.mime ?? "audio/aac");
    if (!audio) return json({ error: "Thiếu dữ liệu âm thanh." }, 400);
    if (audio.length > MAX_AUDIO_BASE64) return json({ error: "Đoạn ghi âm quá dài — hãy nói ngắn gọn hơn." }, 413);
    if (!/^audio\/[\w.+-]+$/.test(mime)) return json({ error: "Định dạng âm thanh không hợp lệ." }, 400);

    const { text, model: usedModel } = await geminiGenerate({
      system: "Bạn là công cụ chép lời (speech-to-text) tiếng Việt chính xác.",
      user:
        `Chép lại CHÍNH XÁC lời nói trong đoạn âm thanh thành văn bản tiếng Việt (giữ nguyên số liệu, tên riêng; thêm dấu câu hợp lý). Người nói đang mô tả một yêu cầu theo dõi tin tức/giá cả/nhắc hẹn. Chỉ trả về ĐÚNG phần văn bản đã chép — không giải thích, không thêm gì khác. Nếu không nghe ra lời nói nào, trả về chuỗi rỗng.`,
      audio: { data: audio, mime },
      temperature: 0,
      // flash-lite free chỉ còn 20 lượt/ngày (2026-07) → cạn thì leo dần bucket khác.
      model: "gemini-2.5-flash-lite",
      fallbackModels: CHEAP_FALLBACK,
    });

    // Đếm vào quota chung (best-effort — bảng usage_logs có thể chưa tạo).
    try {
      const row = { kind: "gemini", ok: true };
      const { error: logErr } = await supabase.from("usage_logs").insert({ ...row, model: usedModel });
      if (logErr) await supabase.from("usage_logs").insert(row); // cột model chưa có (0024)
    } catch { /* bỏ qua */ }

    return json({ text: text.trim() });
  } catch (err) {
    const msg = (err as Error).message;
    const quota = /429|quota|resource_exhausted|rate/i.test(msg);
    return json(
      { error: quota ? "AI đang quá tải/hết lượt. Thử lại sau ít phút hoặc gõ tay nhé." : msg },
      quota ? 429 : 500,
    );
  }
});
