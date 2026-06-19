// Giám sát tin THẬT: gọi Edge Function "run-monitor" (Gemini + Google Search grounding
// chạy server-side). Trước đây quét trong app bằng Ollama local; giờ chạy trên Supabase
// nên cũng chạy nền 24/7 qua pg_cron, không cần PC bật / mở app.

import { supabase } from "./supabase";
import { Rule } from "../types/Rule";

export interface MonitorResult {
  inserted: number;  // số thông báo mới tạo
  checked: number;   // số rule đã quét
  quotaHit?: boolean; // server dừng sớm vì hết quota Gemini
}

// Không retry với lỗi do hết quota / quyền (4xx, 429) — retry chỉ tổ đốt thêm quota.
function isNonRetryable(msg: string): boolean {
  const m = msg.toLowerCase();
  return m.includes("429") || m.includes("quota") || m.includes("resource_exhausted") ||
    m.includes("401") || m.includes("403");
}

async function invokeMonitor(body: Record<string, unknown>): Promise<MonitorResult> {
  let lastErr: unknown;
  // Tối đa 3 lần, backoff 1s/2s — chỉ retry lỗi tạm thời (mạng/5xx/timeout).
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const { data, error } = await supabase.functions.invoke("run-monitor", { body });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return {
        inserted: data?.inserted ?? 0,
        checked: data?.checked ?? 0,
        quotaHit: Boolean(data?.quotaHit),
      };
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (isNonRetryable(msg) || attempt === 2) break;
      await new Promise((r) => setTimeout(r, (attempt + 1) * 1000));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

// Quét 1 rule ngay (nút "Kiểm tra tin ngay").
export async function runMonitorForRule(rule: Rule): Promise<MonitorResult> {
  return invokeMonitor({ ruleId: rule.id });
}

// Quét mọi rule active của user (khi mở app). Cron lo phần nền 24/7.
export async function runMonitorForActiveRules(userId: string): Promise<MonitorResult> {
  return invokeMonitor({ userId });
}
