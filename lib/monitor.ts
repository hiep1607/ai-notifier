// Vòng lặp giám sát THẬT: lấy tin từ Google News → lọc bài đã thấy → AI tóm tắt → lưu DB.
// Chạy ngay trong app (cần Ollama local đang bật). Khi tắt máy thì không có gì chạy.

import { supabase } from "./supabase";
import { fetchNews, NewsItem } from "./news";
import { summarizeArticle } from "./claude";
import { Rule } from "../types/Rule";

// Mỗi lần chạy 1 rule, tạo tối đa bấy nhiêu thông báo mới (tránh spam + đỡ tốn thời gian gọi AI).
const MAX_PER_RUN = 3;

export interface MonitorResult {
  inserted: number;
  checked: number; // số bài lấy về
}

// Chạy giám sát cho 1 rule. Trả về số thông báo mới được tạo.
export async function runMonitorForRule(rule: Rule): Promise<MonitorResult> {
  const items = await fetchNews(rule.keyword, 10);
  if (items.length === 0) return { inserted: 0, checked: 0 };

  // Lấy các URL đã lưu cho rule này để chống trùng.
  const { data: existing } = await supabase
    .from("notifications")
    .select("source_url")
    .eq("rule_id", rule.id);

  const seen = new Set((existing ?? []).map((n) => n.source_url).filter(Boolean));

  // Giữ thứ tự Google News (đã sắp theo độ liên quan), bỏ bài đã thấy.
  const fresh = items.filter((it) => !seen.has(it.link)).slice(0, MAX_PER_RUN);
  if (fresh.length === 0) return { inserted: 0, checked: items.length };

  let inserted = 0;
  for (const item of fresh) {
    try {
      const ok = await insertNotification(rule, item);
      if (ok) inserted++;
    } catch (err) {
      // Một bài lỗi (AI parse fail...) thì bỏ qua, tiếp bài khác.
      console.log("Bỏ qua 1 bài do lỗi:", err);
    }
  }

  return { inserted, checked: items.length };
}

async function insertNotification(rule: Rule, item: NewsItem): Promise<boolean> {
  const summary = await summarizeArticle(
    { title: item.title, snippet: item.snippet, source: item.source },
    { keyword: rule.keyword, condition: rule.condition }
  );

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
