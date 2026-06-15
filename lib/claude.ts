// NL → Rule: gọi Edge Function "generate-rule" (chạy Gemini server-side, key giấu trong
// Supabase secret). Trước đây gọi Ollama local; giờ không cần PC bật Ollama nữa.

import { supabase } from "./supabase";

export interface RuleDraft {
  title: string;
  description: string;
  keyword: string;
  category: string;   // key trong CATEGORIES
  sources: string;
  frequency: string;  // key trong FREQUENCIES
  condition: string;
}

export type RuleAIResult =
  | { status: "need_info"; message: string }
  | { status: "ready"; message: string; rule: RuleDraft };

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

  if (data?.status === "ready" && data.rule) {
    return { status: "ready", message: data.message, rule: data.rule as RuleDraft };
  }
  return {
    status: "need_info",
    message: data?.message ?? "Bạn có thể cho tôi biết thêm chi tiết không?",
  };
}
