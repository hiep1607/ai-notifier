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

// Ngày (YYYY-MM-DD) theo giờ Thái Bình Dương — ĐÚNG mốc reset quota Gemini free tier.
// Dùng Intl để tự xử lý DST (PST/PDT). Bộ đếm quota reset cùng lúc Gemini reset.
function pacificDay(ms: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
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

    // ===== SOI BỘ LỌC RÁC (gate_check) — 1 rule, 1 lượt Gemini, KHÔNG ghi notification =====
    if (action === "gate_check") {
      const ruleId = body.ruleId as string | undefined;
      if (!ruleId) return json({ error: "Thiếu ruleId." }, 400);
      const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/run-monitor`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ ruleId, gateCheck: true }),
      });
      const out = await res.json().catch(() => ({}));
      return json({ ok: res.ok, result: out }, res.ok ? 200 : 502);
    }

    // ===== QUÉT TOÀN BỘ NGAY (cron thử) / XEM TRƯỚC KẾ HOẠCH (dry-run) =====
    // run_cron: gọi run-monitor không kèm ruleId → quét hết rule TỚI HẠN như cron thật.
    // scan_preview: gọi kèm dryRun → chỉ trả kế hoạch (rule nào tới hạn, thứ tự), 0 quota.
    if (action === "run_cron" || action === "scan_preview") {
      const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/run-monitor`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceKey}`,
        },
        body: JSON.stringify(action === "scan_preview" ? { dryRun: true } : {}),
      });
      const out = await res.json().catch(() => ({}));
      return json({ ok: res.ok, result: out }, res.ok ? 200 : 502);
    }

    // ===== USERS (danh sách + thống kê) =====
    if (action === "users") {
      const { data: usersList } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const users = usersList?.users ?? [];
      const { data: rules } = await supabase.from("rules").select("id,user_id");
      const { data: notifs } = await supabase.from("notifications").select("rule_id,created_at");
      const ruleToUser = new Map((rules ?? []).map((r) => [r.id, r.user_id]));
      const ruleCount = new Map<string, number>();
      for (const r of rules ?? []) ruleCount.set(r.user_id, (ruleCount.get(r.user_id) ?? 0) + 1);
      const notifCount = new Map<string, number>();
      const lastAct = new Map<string, string>();
      for (const n of notifs ?? []) {
        const uid = ruleToUser.get(n.rule_id);
        if (!uid) continue;
        notifCount.set(uid, (notifCount.get(uid) ?? 0) + 1);
        const prev = lastAct.get(uid);
        if (!prev || n.created_at > prev) lastAct.set(uid, n.created_at);
      }
      const out = users.map((u) => ({
        id: u.id,
        email: u.email ?? "?",
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at ?? null,
        rules: ruleCount.get(u.id) ?? 0,
        notifications: notifCount.get(u.id) ?? 0,
        last_activity: lastAct.get(u.id) ?? null,
      })).sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
      return json({ users: out });
    }

    // ===== USER DETAIL =====
    if (action === "user_detail") {
      const userId = body.userId as string | undefined;
      if (!userId) return json({ error: "Thiếu userId." }, 400);
      const { data: ures } = await supabase.auth.admin.getUserById(userId);
      const { data: rules } = await supabase.from("rules").select("*")
        .eq("user_id", userId).order("created_at", { ascending: true });
      const ruleIds = (rules ?? []).map((r) => r.id);
      let notifs: unknown[] = [];
      if (ruleIds.length) {
        const { data } = await supabase.from("notifications")
          .select("id,rule_id,title,ai_summary,category,sentiment,created_at")
          .in("rule_id", ruleIds).order("created_at", { ascending: false }).limit(30);
        notifs = data ?? [];
      }
      const { data: tokens } = await supabase.from("push_tokens")
        .select("token,platform,created_at").eq("user_id", userId);
      const { data: settings } = await supabase.from("user_settings")
        .select("*").eq("user_id", userId).maybeSingle();
      const usr = ures?.user;
      return json({
        user: usr
          ? { id: usr.id, email: usr.email, created_at: usr.created_at, last_sign_in_at: usr.last_sign_in_at }
          : null,
        rules: rules ?? [],
        notifications: notifs,
        tokens: tokens ?? [],
        settings: settings ?? null,
      });
    }

    // ===== NOTIFICATIONS (stream toàn hệ thống + lọc) =====
    if (action === "notifications") {
      const category = body.category as string | undefined;
      const sentiment = body.sentiment as string | undefined;
      let q = supabase.from("notifications")
        .select("id,rule_id,title,ai_summary,source,source_url,category,sentiment,is_important,created_at")
        .order("created_at", { ascending: false }).limit(80);
      if (category) q = q.eq("category", category);
      if (sentiment) q = q.eq("sentiment", sentiment);
      const { data: notifs } = await q;
      const ruleIds = [...new Set((notifs ?? []).map((n) => n.rule_id).filter(Boolean))];
      const ruleMap = new Map<string, { keyword: string; user_id: string }>();
      if (ruleIds.length) {
        const { data: rules } = await supabase.from("rules").select("id,keyword,user_id").in("id", ruleIds);
        for (const r of rules ?? []) ruleMap.set(r.id, { keyword: r.keyword, user_id: r.user_id });
      }
      const { data: usersList } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const emailMap = new Map((usersList?.users ?? []).map((x) => [x.id, x.email ?? "?"]));
      const enriched = (notifs ?? []).map((n) => {
        const r = ruleMap.get(n.rule_id);
        return { ...n, keyword: r?.keyword ?? "?", email: r ? (emailMap.get(r.user_id) ?? "?") : "?" };
      });
      return json({ notifications: enriched });
    }

    // ===== USAGE (quota Gemini 7 ngày — đếm theo TỪNG MODEL, mỗi model 1 trần ngày riêng) =====
    if (action === "usage") {
      try {
        const since = new Date(Date.now() - 7 * 86400000).toISOString();
        // Cột model có từ 0024 — chưa chạy migration thì rơi về select cũ (byModel trống).
        let rows: { created_at: string; ok: boolean; model?: string | null }[] | null;
        const withModel = await supabase.from("usage_logs")
          .select("created_at,ok,model").gte("created_at", since);
        if (!withModel.error) {
          rows = withModel.data;
        } else {
          const plain = await supabase.from("usage_logs")
            .select("created_at,ok").gte("created_at", since);
          if (plain.error) throw plain.error;
          rows = plain.data;
        }
        const byDay = new Map<string, { total: number; errors: number }>();
        const byModel = new Map<string, { total: number; errors: number }>();
        const todayKey = pacificDay(Date.now());
        for (const r of rows ?? []) {
          const d = pacificDay(Date.parse(r.created_at)); // gom theo NGÀY GIỜ MỸ (mốc reset Gemini)
          const cur = byDay.get(d) ?? { total: 0, errors: 0 };
          cur.total++;
          if (!r.ok) cur.errors++;
          byDay.set(d, cur);
          if (d === todayKey) {
            const m = r.model || "(chưa ghi model)";
            const cm = byModel.get(m) ?? { total: 0, errors: 0 };
            cm.total++;
            if (!r.ok) cm.errors++;
            byModel.set(m, cm);
          }
        }
        const today = byDay.get(todayKey) ?? { total: 0, errors: 0 };
        const days = [...byDay.entries()].map(([date, v]) => ({ date, ...v }))
          .sort((a, b) => a.date.localeCompare(b.date));
        const models = [...byModel.entries()].map(([model, v]) => ({ model, ...v }))
          .sort((a, b) => b.total - a.total);
        // Lỗi Gemini gần nhất (để chẩn đoán 429/quota).
        const { data: errRows } = await supabase.from("usage_logs")
          .select("error,created_at").eq("ok", false)
          .order("created_at", { ascending: false }).limit(1);
        const lastError: string | null = errRows?.[0]?.error ?? null;
        // KHÔNG còn `limit` chung — trần tính riêng từng model, client tự hiển thị.
        return json({ available: true, today: today.total, todayErrors: today.errors, days, models, lastError });
      } catch {
        return json({ available: false }); // bảng usage_logs chưa tạo
      }
    }

    // ===== CRON RUNS (sức khỏe nền) =====
    if (action === "cron_runs") {
      try {
        const { data, error } = await supabase.from("cron_runs")
          .select("*").order("created_at", { ascending: false }).limit(40);
        if (error) throw error;
        return json({ available: true, runs: data ?? [] });
      } catch {
        return json({ available: false, runs: [] }); // bảng cron_runs chưa tạo
      }
    }

    // ===== PUSH TEST =====
    if (action === "push_test") {
      const userId = body.userId as string | undefined;
      if (!userId) return json({ error: "Thiếu userId." }, 400);
      const { data: toks } = await supabase.from("push_tokens").select("token").eq("user_id", userId);
      const tokens = (toks ?? []).map((t) => t.token).filter(Boolean);
      if (!tokens.length) return json({ ok: false, message: "User này chưa có push token." });
      const messages = tokens.map((to: string) => ({
        to,
        title: "Thông báo thử (admin)",
        body: "Đây là push test gửi từ trang quản trị.",
        sound: "default",
      }));
      const res = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(messages),
      });
      const out = await res.json().catch(() => ({}));
      return json({ ok: res.ok, sent: tokens.length, result: out });
    }

    // ===== QUẢN LÝ RULE (bật/tắt, để êm, xóa) =====
    if (action === "rule_action") {
      const ruleId = body.ruleId as string | undefined;
      const op = body.op as string | undefined; // toggle_active | toggle_muted | delete
      if (!ruleId || !op) return json({ error: "Thiếu ruleId/op." }, 400);

      if (op === "delete") {
        // notifications.rule_id có ON DELETE CASCADE (migration 0014) → xóa rule là
        // thông báo con tự xóa theo, không cần xóa thủ công trước.
        const { error } = await supabase.from("rules").delete().eq("id", ruleId);
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true });
      }

      const col = op === "toggle_active" ? "is_active" : op === "toggle_muted" ? "muted" : null;
      if (!col) return json({ error: "op không hợp lệ." }, 400);
      const { data: cur } = await supabase.from("rules").select(col).eq("id", ruleId).maybeSingle();
      if (!cur) return json({ error: "Không tìm thấy rule." }, 404);
      const newVal = !(cur as Record<string, unknown>)[col];
      const { error } = await supabase.from("rules").update({ [col]: newVal }).eq("id", ruleId);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true, [col]: newVal });
    }

    // ===== XÓA NGƯỜI DÙNG (cascade rule/notification/token) =====
    if (action === "delete_user") {
      const userId = body.userId as string | undefined;
      if (!userId) return json({ error: "Thiếu userId." }, 400);
      if (userId === u.user.id) return json({ error: "Không thể tự xóa tài khoản admin đang dùng." }, 400);
      // Xóa user → rules/push_tokens/user_settings tự cascade theo auth.users, và
      // notifications cascade theo rules (migration 0014). Không cần dọn thủ công.
      const { error } = await supabase.auth.admin.deleteUser(userId);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    return json({ error: "Hành động không hỗ trợ." }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
