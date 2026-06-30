// NL → Rule: gọi Edge Function "generate-rule" (chạy Gemini server-side, key giấu trong
// Supabase secret). Trước đây gọi Ollama local; giờ không cần PC bật Ollama nữa.

import { supabase } from "./supabase";

export interface RuleDraft {
  title: string;
  description: string;
  keyword: string;
  category: string;   // key trong CATEGORIES
  sources: string;
  frequency: string;  // "change" | số phút (vd "1440")
  run_at: string;     // giờ báo "HH:MM" (giờ VN); "" nếu không ghim giờ
  condition: string;
  noise_risk?: "low" | "high"; // AI chấm: "high" = chủ đề dễ ra nhiều thông báo ít giá trị
  noise_reason?: string;       // 1 câu giải thích vì sao (chỉ khi "high")
}

export type RuleAIResult =
  | { status: "need_info"; message: string }
  | { status: "ready"; message: string; rules: RuleDraft[] };

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

// Không retry lỗi do hết quota/quyền — chỉ retry lỗi tạm thời (mạng/5xx/timeout).
function isNonRetryable(msg: string): boolean {
  const m = msg.toLowerCase();
  return m.includes("429") || m.includes("quota") || m.includes("resource_exhausted") ||
    m.includes("401") || m.includes("403");
}

export async function chatRule(history: ChatTurn[]): Promise<RuleAIResult> {
  let data: any, lastErr: unknown;
  // Tối đa 3 lần, backoff 1s/2s — tránh fail vì Gemini trục trặc tạm thời.
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await supabase.functions.invoke("generate-rule", { body: { history } });
    const err = res.error || (res.data?.error ? new Error(res.data.error) : null);
    if (!err) { data = res.data; lastErr = null; break; }
    lastErr = err;
    if (isNonRetryable(err.message) || attempt === 2) break;
    await new Promise((r) => setTimeout(r, (attempt + 1) * 1000));
  }
  if (lastErr) throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));

  // Tương thích cả "rules" (mảng, mới) lẫn "rule" (đơn, cũ).
  const rules: RuleDraft[] = Array.isArray(data?.rules)
    ? (data.rules as RuleDraft[])
    : data?.rule
      ? [data.rule as RuleDraft]
      : [];

  if (data?.status === "ready" && rules.length > 0) {
    return { status: "ready", message: data.message, rules };
  }
  return {
    status: "need_info",
    message: data?.message ?? "Bạn có thể cho tôi biết thêm chi tiết không?",
  };
}
