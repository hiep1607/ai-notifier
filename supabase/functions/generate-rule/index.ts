import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { message } = await req.json();

    if (!message?.trim()) {
      return new Response(
        JSON.stringify({ error: "message is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 256,
        system: `Bạn là trợ lý tạo rule theo dõi thông tin tự động.
Từ yêu cầu của người dùng, hãy trả về JSON với đúng 3 trường:
{
  "title": "...",
  "description": "...",
  "keyword": "..."
}
- title: tên ngắn gọn cho rule (tối đa 6 từ), mô tả chủ đề theo dõi
- description: giải thích rule sẽ làm gì (1 câu ngắn)
- keyword: từ khóa tìm kiếm chính, ngắn gọn (1-4 từ), tiếng Việt nếu phù hợp
Chỉ trả về JSON thuần, không có markdown, không giải thích thêm.`,
        messages: [{ role: "user", content: message }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return new Response(
        JSON.stringify({ error: `Claude API error: ${err}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const claude = await response.json();
    const raw = claude.content?.[0]?.text ?? "";

    // Parse JSON — strip possible markdown code fences
    const jsonStr = raw.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    const rule = JSON.parse(jsonStr);

    return new Response(JSON.stringify(rule), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
