import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { ruleId } = await req.json();

    if (!ruleId) {
      return new Response(
        JSON.stringify({ error: "ruleId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch rule từ DB
    const supabase = createClient(supabaseUrl, serviceKey);
    const { data: rule, error: ruleError } = await supabase
      .from("rules")
      .select("*")
      .eq("id", ruleId)
      .single();

    if (ruleError || !rule) {
      return new Response(
        JSON.stringify({ error: "Rule not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!rule.is_active) {
      return new Response(
        JSON.stringify({ error: "Rule is not active" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Gọi Claude sinh notification giả lập
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 512,
        system: `Bạn là AI giám sát tin tức tự động. Nhiệm vụ của bạn là sinh 1 thông báo tin tức thực tế,
như thể bạn vừa tìm thấy một bài báo hoặc sự kiện mới liên quan đến keyword được cung cấp.
Thông báo phải nghe có vẻ thật và hợp lý với bối cảnh hiện tại.

Trả về JSON với đúng 4 trường:
{
  "title": "...",
  "content": "...",
  "ai_summary": "...",
  "is_important": true/false
}
- title: tiêu đề tin tức ngắn gọn (~8-12 từ), viết như tiêu đề báo
- content: nội dung chi tiết (3-4 câu), viết như đoạn mở đầu bài báo
- ai_summary: tóm tắt 1 câu ngắn (~15 từ)
- is_important: true nếu nội dung có biến động lớn, bất thường hoặc cần chú ý ngay; false nếu là tin thông thường

Chỉ trả về JSON thuần, không có markdown, không giải thích thêm.`,
        messages: [{
          role: "user",
          content: `Keyword theo dõi: "${rule.keyword}"\nMô tả rule: "${rule.description || rule.title}"\n\nSinh 1 thông báo tin tức mới nhất liên quan đến keyword này.`,
        }],
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
    const jsonStr = raw.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    const notifData = JSON.parse(jsonStr);

    // Insert notification vào DB
    const { data: notification, error: insertError } = await supabase
      .from("notifications")
      .insert([{
        rule_id: ruleId,
        title: notifData.title,
        content: notifData.content,
        ai_summary: notifData.ai_summary,
        is_important: notifData.is_important ?? false,
        is_read: false,
      }])
      .select()
      .single();

    if (insertError) {
      return new Response(
        JSON.stringify({ error: `Insert failed: ${insertError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify(notification), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
