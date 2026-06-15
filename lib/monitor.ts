// Vòng lặp giám sát THẬT: lấy tin từ Google News → lọc bài đã thấy → AI tóm tắt → lưu DB.
// Chạy ngay trong app (cần Ollama local đang bật). Khi tắt máy thì không có gì chạy.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";
import { fetchNews, fetchArticleBody, NewsItem } from "./news";
import { summarizeArticle } from "./claude";
import { Rule } from "../types/Rule";

// Mỗi lần chạy 1 rule, tạo tối đa bấy nhiêu thông báo mới (tránh spam + đỡ tốn thời gian gọi AI).
const MAX_PER_RUN = 3;
// Số URL đã xét giữ lại cho mỗi rule (state nhẹ thay cho rule_state/seen_ids của Smart Notify).
const SEEN_CAP = 200;

export interface MonitorResult {
  inserted: number;
  checked: number; // số bài lấy về
}

// "seen state" theo từng rule: nhớ những URL ĐÃ XÉT (dù có tạo thông báo hay không)
// → không gọi lại AI cho bài cũ không thỏa điều kiện ở mỗi lần quét. Lưu AsyncStorage (web+mobile).
function seenKey(ruleId: string): string {
  return `@seen_${ruleId}`;
}

async function loadSeen(ruleId: string): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(seenKey(ruleId));
    const arr = raw ? (JSON.parse(raw) as string[]) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

async function saveSeen(ruleId: string, seen: Set<string>): Promise<void> {
  try {
    // Giữ SEEN_CAP URL gần nhất để không phình vô hạn.
    const arr = Array.from(seen).slice(-SEEN_CAP);
    await AsyncStorage.setItem(seenKey(ruleId), JSON.stringify(arr));
  } catch {
    // Lưu lỗi thì bỏ qua — lần sau dedup DB vẫn chặn trùng thông báo.
  }
}

// Chạy giám sát cho 1 rule. Trả về số thông báo mới được tạo.
export async function runMonitorForRule(rule: Rule): Promise<MonitorResult> {
  const items = await fetchNews(rule.keyword, rule.category ?? "other", 10);
  if (items.length === 0) return { inserted: 0, checked: 0 };

  // Chống trùng: URL đã có thông báo trong DB + URL đã XÉT (seen state AsyncStorage).
  const { data: existing } = await supabase
    .from("notifications")
    .select("source_url")
    .eq("rule_id", rule.id);

  const seen = await loadSeen(rule.id);
  for (const n of existing ?? []) if (n.source_url) seen.add(n.source_url);

  // Giữ thứ tự nguồn (mới nhất trước), bỏ bài đã xét.
  const fresh = items.filter((it) => !seen.has(it.link)).slice(0, MAX_PER_RUN);
  if (fresh.length === 0) return { inserted: 0, checked: items.length };

  let inserted = 0;
  for (const item of fresh) {
    // Đánh dấu đã xét NGAY (kể cả khi không thỏa điều kiện) → khỏi xử lý lại lần quét sau.
    seen.add(item.link);
    try {
      const ok = await insertNotification(rule, item);
      if (ok) inserted++;
    } catch (err) {
      // Một bài lỗi (AI parse fail...) thì bỏ qua, tiếp bài khác.
      console.log("Bỏ qua 1 bài do lỗi:", err);
    }
  }

  await saveSeen(rule.id, seen);
  return { inserted, checked: items.length };
}

async function insertNotification(rule: Rule, item: NewsItem): Promise<boolean> {
  // Lấy full nội dung bài để AI có số liệu thật; lỗi thì dùng snippet.
  const body = await fetchArticleBody(item.link);

  const summary = await summarizeArticle(
    { title: item.title, snippet: item.snippet, source: item.source, body },
    { keyword: rule.keyword, condition: rule.condition }
  );

  // Trigger "match/threshold" (ý từ Smart Notify): rule có điều kiện mà bài KHÔNG thỏa
  // thì không tạo thông báo — tránh báo tin không liên quan điều kiện người dùng đặt.
  if (!summary.matches_condition) return false;

  const { error } = await supabase.from("notifications").insert([{
    rule_id: rule.id,
    title: item.title,
    content: summary.content,
    ai_summary: summary.ai_summary,
    source: item.source,
    source_url: item.link,
    category: rule.category ?? "news",
    sentiment: summary.sentiment,
    is_important: summary.is_important,
    is_read: false,
  }]);

  if (error) {
    // Có thể trùng URL do chạy song song — coi như không insert.
    console.log("Insert lỗi:", error.message);
    return false;
  }
  return true;
}

// Chạy giám sát cho TẤT CẢ rule đang active của user. Dùng khi mở app.
export async function runMonitorForActiveRules(userId: string): Promise<MonitorResult> {
  const { data: rules } = await supabase
    .from("rules")
    .select("*")
    .eq("user_id", userId)
    .eq("is_active", true);

  if (!rules || rules.length === 0) return { inserted: 0, checked: 0 };

  let inserted = 0;
  let checked = 0;
  for (const rule of rules as Rule[]) {
    try {
      const res = await runMonitorForRule(rule);
      inserted += res.inserted;
      checked += res.checked;
    } catch (err) {
      console.log(`Rule "${rule.title}" lỗi:`, err);
    }
  }

  return { inserted, checked };
}
