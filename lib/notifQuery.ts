// Truy vấn thông báo theo CHỦ SỞ HỮU trực tiếp (cột user_id — migration 0021).
// Lý do: nhắc hẹn giờ TỰ XÓA rule sau khi nhắc, thông báo nhắc thành "mồ côi rule"
// (rule_id = null) — lọc kiểu cũ `rule_id in (rules của tôi)` sẽ làm nó biến mất.
// Chưa chạy 0021 (thiếu cột user_id) → truy vấn lỗi → tự rơi về cách cũ (tự lấy
// danh sách rule id, người gọi khỏi phải truyền).

import { supabase } from "./supabase";
import { Notification } from "../types/Notification";

export interface NotifOpts {
  limit?: number;        // giới hạn số dòng — màn danh sách chỉ cần ~100 dòng gần nhất
  unreadOnly?: boolean;
  importantOnly?: boolean;
}

async function userRuleIds(userId: string): Promise<string[]> {
  const { data } = await supabase.from("rules").select("id").eq("user_id", userId);
  return (data ?? []).map((r: { id: string }) => r.id);
}

export async function fetchNotificationsFor(
  userId: string,
  opts: NotifOpts = {},
): Promise<Notification[]> {
  let q = supabase.from("notifications").select("*").eq("user_id", userId);
  if (opts.unreadOnly) q = q.eq("is_read", false);
  if (opts.importantOnly) q = q.eq("is_important", true);
  q = q.order("created_at", { ascending: false });
  if (opts.limit) q = q.limit(opts.limit);
  const { data, error } = await q;
  if (!error) return (data ?? []) as Notification[];

  const ids = await userRuleIds(userId);
  if (ids.length === 0) return [];
  let q2 = supabase.from("notifications").select("*").in("rule_id", ids);
  if (opts.unreadOnly) q2 = q2.eq("is_read", false);
  if (opts.importantOnly) q2 = q2.eq("is_important", true);
  q2 = q2.order("created_at", { ascending: false });
  if (opts.limit) q2 = q2.limit(opts.limit);
  const { data: old } = await q2;
  return (old ?? []) as Notification[];
}

export async function countNotificationsFor(
  userId: string,
  opts: NotifOpts = {},
): Promise<number> {
  let q = supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);
  if (opts.unreadOnly) q = q.eq("is_read", false);
  if (opts.importantOnly) q = q.eq("is_important", true);
  const { count, error } = await q;
  if (!error) return count ?? 0;

  const ids = await userRuleIds(userId);
  if (ids.length === 0) return 0;
  let q2 = supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .in("rule_id", ids);
  if (opts.unreadOnly) q2 = q2.eq("is_read", false);
  if (opts.importantOnly) q2 = q2.eq("is_important", true);
  const { count: c2 } = await q2;
  return c2 ?? 0;
}
