// Truy vấn thông báo theo CHỦ SỞ HỮU trực tiếp (cột user_id — migration 0021).
// Lý do: nhắc hẹn giờ TỰ XÓA rule sau khi nhắc, thông báo nhắc thành "mồ côi rule"
// (rule_id = null) — lọc kiểu cũ `rule_id in (rules của tôi)` sẽ làm nó biến mất.
// Chưa chạy 0021 (thiếu cột user_id) → truy vấn lỗi → tự rơi về cách cũ (tự lấy
// danh sách rule id, người gọi khỏi phải truyền).

import { supabase } from "./supabase";
import { Notification } from "../types/Notification";

export const NOTIFICATIONS_PAGE_SIZE = 50;

export interface NotifOpts {
  limit?: number;
  offset?: number;
  unreadOnly?: boolean;
  importantOnly?: boolean;
}

type QueryError = { code?: string; message?: string; details?: string };

function isMissingUserId(error: QueryError | null): boolean {
  if (!error) return false;
  const text = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
  return ["42703", "PGRST204"].includes(error.code ?? "") && text.includes("user_id");
}

function queryError(context: string, error: QueryError | null): Error {
  const result = new Error(`${context}: ${error?.message ?? "lỗi truy vấn không xác định"}`);
  if (error?.code) Object.assign(result, { code: error.code });
  return result;
}

async function userRuleIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase.from("rules").select("id").eq("user_id", userId);
  if (error) throw queryError("Không thể tải danh sách rule", error);
  return (data ?? []).map((r: { id: string }) => r.id);
}

function applyWindow<T>(query: T, opts: NotifOpts): T {
  if (!opts.limit) return query;
  const start = Math.max(0, opts.offset ?? 0);
  return (query as T & { range(from: number, to: number): T }).range(
    start,
    start + opts.limit - 1,
  );
}

export async function fetchNotificationsFor(
  userId: string,
  opts: NotifOpts = {},
): Promise<Notification[]> {
  let q = supabase.from("notifications").select("*").eq("user_id", userId);
  if (opts.unreadOnly) q = q.eq("is_read", false);
  if (opts.importantOnly) q = q.eq("is_important", true);
  q = q.order("created_at", { ascending: false });
  q = applyWindow(q, opts);
  const { data, error } = await q;
  if (!error) return (data ?? []) as Notification[];
  if (!isMissingUserId(error)) throw queryError("Không thể tải thông báo", error);

  const ids = await userRuleIds(userId);
  if (ids.length === 0) return [];
  let q2 = supabase.from("notifications").select("*").in("rule_id", ids);
  if (opts.unreadOnly) q2 = q2.eq("is_read", false);
  if (opts.importantOnly) q2 = q2.eq("is_important", true);
  q2 = q2.order("created_at", { ascending: false });
  q2 = applyWindow(q2, opts);
  const { data: old, error: oldError } = await q2;
  if (oldError) throw queryError("Không thể tải thông báo theo schema cũ", oldError);
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
  if (!isMissingUserId(error)) throw queryError("Không thể đếm thông báo", error);

  const ids = await userRuleIds(userId);
  if (ids.length === 0) return 0;
  let q2 = supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .in("rule_id", ids);
  if (opts.unreadOnly) q2 = q2.eq("is_read", false);
  if (opts.importantOnly) q2 = q2.eq("is_important", true);
  const { count: c2, error: oldError } = await q2;
  if (oldError) throw queryError("Không thể đếm thông báo theo schema cũ", oldError);
  return c2 ?? 0;
}
