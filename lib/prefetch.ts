// Tải trước dữ liệu MỌI TAB ngay lúc mở app (sau khi có session):
// (1) kéo cache đĩa vào RAM — tab nào mở cũng vẽ được NGAY khung hình đầu,
// (2) tải bản mới từ mạng 1 LƯỢT rồi ghi vào đúng các khóa cache mà từng màn
//     dùng — user bấm sang tab là dữ liệu mới đã nằm sẵn, không phải chờ nữa.
// Best-effort: lỗi mạng thì im lặng, từng màn vẫn tự fetch khi mở như cũ.

import { supabase } from "./supabase";
import { countNotificationsFor, fetchNotificationsFor } from "./notifQuery";
import { loadCache, saveCache } from "./screenCache";
import { Rule } from "../types/Rule";
import { Notification } from "../types/Notification";

// Hình dạng cache của từng màn — PHẢI khớp với chỗ màn đó save/load.
export interface HomeCache {
  rules: Rule[];
  notificationsCount: number;
  importantCount: number;
  latestImportant: Notification | null;
  latestNotif: Notification | null;
}
export interface NotifsCache {
  nameMap: Record<string, string>;
  notifs: Notification[];
}
export interface RulesCache {
  rules: Rule[];
  counts: Record<string, number>;
}
export interface BadgesCache {
  unread: number;
  active: number;
}

export const homeCacheKey = (uid: string) => `@cache_home_${uid}`;
export const notifsCacheKey = (uid: string) => `@cache_notifs_${uid}`;
export const rulesCacheKey = (uid: string) => `@cache_rules_${uid}`;
export const badgesCacheKey = (uid: string) => `@cache_badges_${uid}`;

let prefetchedFor: string | null = null;

export async function prefetchAppData(userId: string): Promise<void> {
  if (prefetchedFor === userId) return; // 1 lần mỗi phiên đăng nhập là đủ
  prefetchedFor = userId;

  // (1) Đĩa → RAM: chạy trước và không phụ thuộc mạng (offline vẫn có dữ liệu cũ).
  await Promise.all([
    loadCache(homeCacheKey(userId)),
    loadCache(notifsCacheKey(userId)),
    loadCache(rulesCacheKey(userId)),
    loadCache(badgesCacheKey(userId)),
  ]).catch(() => {});

  // (2) Mạng → cache: 4 truy vấn SONG SONG, đủ dữ liệu cho cả 3 màn + badge.
  try {
    const [rulesRes, notifs, unread, unreadRowsRes] = await Promise.all([
      supabase
        .from("rules")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: true }),
      fetchNotificationsFor(userId, { limit: 100 }),
      countNotificationsFor(userId, { unreadOnly: true }),
      supabase
        .from("notifications")
        .select("rule_id")
        .eq("user_id", userId)
        .eq("is_read", false),
    ]);
    if (rulesRes.error) return;
    const rules = (rulesRes.data ?? []) as Rule[];

    const important = notifs.filter((n) => n.is_important);
    saveCache(homeCacheKey(userId), {
      rules,
      notificationsCount: notifs.length,
      importantCount: important.length,
      latestImportant: important[0] ?? null,
      latestNotif: notifs[0] ?? null,
    } satisfies HomeCache);

    const nameMap: Record<string, string> = {};
    rules.forEach((r) => {
      nameMap[r.id] = r.title || r.keyword || "Rule";
    });
    saveCache(notifsCacheKey(userId), { nameMap, notifs } satisfies NotifsCache);

    // Thiếu cột user_id (0021 chưa chạy) → đếm tạm từ 100 tin gần nhất, màn Rules
    // tự sửa lại khi mở (nó có fallback đếm theo rule_id đầy đủ).
    const unreadRows = unreadRowsRes.error
      ? notifs.filter((n) => !n.is_read)
      : unreadRowsRes.data ?? [];
    const counts: Record<string, number> = {};
    unreadRows.forEach((n: { rule_id: string | null }) => {
      if (n.rule_id) counts[n.rule_id] = (counts[n.rule_id] ?? 0) + 1;
    });
    saveCache(rulesCacheKey(userId), { rules, counts } satisfies RulesCache);

    saveCache(badgesCacheKey(userId), {
      unread,
      active: rules.filter((r) => r.is_active).length,
    } satisfies BadgesCache);
  } catch {
    // Mất mạng / lỗi tạm → thôi, từng màn tự fetch lại khi được mở.
    prefetchedFor = null; // cho phép thử lại ở lần focus sau
  }
}
