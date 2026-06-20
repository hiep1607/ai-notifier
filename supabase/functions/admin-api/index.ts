// Edge Function: API cho TRANG QUẢN TRỊ (chỉ chủ app). Dùng service_role để đọc dữ liệu
// TOÀN HỆ THỐNG (bỏ qua RLS) NHƯNG chỉ sau khi xác thực người gọi là ADMIN.
//
// PHÂN QUYỀN (2 lớp ở server):
//  1. Xác thực JWT người gọi bằng supabase.auth.getUser(token) → lấy email thật.
//  2. Email phải nằm trong secret ADMIN_EMAILS (danh sách, phân tách bằng dấu phẩy).
// Không hợp lệ → 401, không phải admin → 403. RLS KHÔNG bị nới.
//
// Actions (POST { action, ... }):
//  - overview : số liệu tổng quan (user/rule/notification/push token).
//  - rules    : danh sách MỌI rule kèm email chủ rule.
//  - run_rule : chạy thử 1 rule (gọi run-monitor bằng service_role).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";

// Mốc 00:00 HÔM NAY theo giờ VN (UTC+7), trả ISO để so created_at.
function vnTodayStartIso(): string {
  const nowVn = new Date(Date.now() + 7 * 3600000);
  const startVnMs = Date.UTC(
    nowVn.getUTCFullYear(),
    nowVn.getUTCMonth(),
    nowVn.getUTCDate(),
  ) - 7 * 3600000;
  return new Date(startVnMs).toISOString();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);

    // --- GATE ADMIN ---
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "Cần đăng nhập." }, 401);
    const { data: u, error: uErr } = await supabase.auth.getUser(token);
    if (uErr || !u?.user) return json({ error: "Phiên đăng nhập không hợp lệ." }, 401);

    const email = (u.user.email ?? "").toLowerCase();
    const admins = (Deno.env.get("ADMIN_EMAILS") ?? "")
      .toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);
    if (!admins.includes(email)) return json({ error: "Không có quyền quản trị." }, 403);

    const body = await req.json().catch(() => ({}));
    const action = (body.action ?? "overview") as string;

    // ===== OVERVIEW =====
    if (action === "overview") {
      const head = { count: "exact" as const, head: true };
      const [users, rulesTotal, rulesActive, rulesMuted, notifTotal, notifToday, tokens] =
        await Promise.all([
          supabase.auth.admin.listUsers({ page: 1, perPage: 1000 }),
          supabase.from("rules").select("id", head),
          supabase.from("rules").select("id", head).eq("is_active", true),
          supabase.from("rules").select("id", head).eq("muted", true),
          supabase.from("notifications").select("id", head),
          supabase.from("notifications").select("id", head).gte("created_at", vnTodayStartIso()),
          supabase.from("push_tokens").select("id", head),
        ]);
      return json({
        users: users.data?.users?.length ?? 0,
        rulesTotal: rulesTotal.count ?? 0,
        rulesActive: rulesActive.count ?? 0,
        rulesMuted: rulesMuted.count ?? 0,
        notifTotal: notifTotal.count ?? 0,
        notifToday: notifToday.count ?? 0,
        pushTokens: tokens.count ?? 0,
      });
    }

    // ===== RULES (toàn hệ thống) =====
    if (action === "rules") {
      const { data: rules, error } = await supabase
        .from("rules")
        .select("id,user_id,keyword,category,frequency,condition,run_at,last_run_at,last_value,muted,is_active,created_at")
        .order("last_run_at", { ascending: true, nullsFirst: true });
      if (error) return json({ error: error.message }, 500);

      const { data: usersList } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const emailMap = new Map((usersList?.users ?? []).map((x) => [x.id, x.email ?? "?"]));
      const enriched = (rules ?? []).map((r) => ({ ...r, email: emailMap.get(r.user_id) ?? "?" }));
      return json({ rules: enriched });
    }

    // ===== RUN 1 RULE (chạy thử) =====
    if (action === "run_rule") {
      const ruleId = body.ruleId as string | undefined;
      if (!ruleId) return json({ error: "Thiếu ruleId." }, 400);
      const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/run-monitor`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ ruleId }),
      });
      const out = await res.json().catch(() => ({}));
      return json({ ok: res.ok, result: out }, res.ok ? 200 : 502);
    }

    return json({ error: "Hành động không hỗ trợ." }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
