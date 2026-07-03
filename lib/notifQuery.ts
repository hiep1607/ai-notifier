// Truy vấn thông báo theo CHỦ SỞ HỮU trực tiếp (cột user_id — migration 0021).
// Lý do: nhắc hẹn giờ TỰ XÓA rule sau khi nhắc, thông báo nhắc thành "mồ côi rule"
// (rule_id = null) — lọc kiểu cũ `rule_id in (rules của tôi)` sẽ làm nó biến mất.
// Chưa chạy 0021 (thiếu cột user_id) → truy vấn lỗi → tự rơi về cách cũ.

import { supabase } from "./supabase";
import { Notification } from "../types/Notification";

export async function fetchNotificationsFor(
  userId: string,
  ruleIds: string[],
): Promise<Notification[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (!error) return (data ?? []) as Notification[];

  if (ruleIds.length === 0) return [];
  const { data: old } = await supabase
    .from("notifications")
    .select("*")
    .in("rule_id", ruleIds)
    .order("created_at", { ascending: false });
  return (old ?? []) as Notification[];
}

export async function countNotificationsFor(
  userId: string,
  ruleIds: string[],
  unreadOnly = false,
): Promise<number> {
  let q = supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);
  if (unreadOnly) q = q.eq("is_read", false);
  const { count, error } = await q;
  if (!error) return count ?? 0;

  if (ruleIds.length === 0) return 0;
  let q2 = supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .in("rule_id", ruleIds);
  if (unreadOnly) q2 = q2.eq("is_read", false);
  const { count: c2 } = await q2;
  return c2 ?? 0;
}
