// Giám sát tin THẬT: gọi Edge Function "run-monitor" (Gemini + Google Search grounding
// chạy server-side). Trước đây quét trong app bằng Ollama local; giờ chạy trên Supabase
// nên cũng chạy nền 24/7 qua pg_cron, không cần PC bật / mở app.

import { supabase } from "./supabase";
import { Rule } from "../types/Rule";

export interface MonitorResult {
  inserted: number; // số thông báo mới tạo
  checked: number;  // số rule đã quét
}

async function invokeMonitor(body: Record<string, unknown>): Promise<MonitorResult> {
  const { data, error } = await supabase.functions.invoke("run-monitor", { body });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return { inserted: data?.inserted ?? 0, checked: data?.checked ?? 0 };
}

// Quét 1 rule ngay (nút "Kiểm tra tin ngay").
export async function runMonitorForRule(rule: Rule): Promise<MonitorResult> {
  return invokeMonitor({ ruleId: rule.id });
}

// Quét mọi rule active của user (khi mở app). Cron lo phần nền 24/7.
export async function runMonitorForActiveRules(userId: string): Promise<MonitorResult> {
  return invokeMonitor({ userId });
}
