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
}

export type RuleAIResult =
  | { status: "need_info"; message: string }
  | { status: "ready"; message: string; rules: RuleDraft[] };

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export async function chatRule(history: ChatTurn[]): Promise<RuleAIResult> {
  const { data, error } = await supabase.functions.invoke("generate-rule", {
    body: { history },
  });

  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);

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
