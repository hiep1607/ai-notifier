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

export type PreviewKind = "real" | "nochange" | "related" | "none" | "skipped";
export interface RulePreviewResult {
  gateCheck: true;
  keyword: string;
  currentMode: string;
  provider?: string;
  found: boolean;
  candidateTitle: string;
  value: string;
  isImportant: boolean;
  matchesCondition: boolean;
  changed: boolean;
  fresh: boolean;
  allKind: PreviewKind;
  importantPushed: boolean;
  importantReason: string;
}

// Không retry với lỗi do hết quota / quyền (4xx, 429) — retry chỉ tổ đốt thêm quota.
function isNonRetryable(msg: string): boolean {
  const m = msg.toLowerCase();
  return m.includes("429") || m.includes("quota") || m.includes("resource_exhausted") ||
    m.includes("401") || m.includes("403");
}

async function invokeRunMonitor<T>(body: Record<string, unknown>): Promise<T> {
  let lastErr: unknown;
  // Tối đa 3 lần, backoff 1s/2s — chỉ retry lỗi tạm thời (mạng/5xx/timeout).
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const { data, error } = await supabase.functions.invoke("run-monitor", { body });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data as T;
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
  const data = await invokeRunMonitor<Partial<MonitorResult>>({ ruleId: rule.id });
  return {
    inserted: data.inserted ?? 0,
    checked: data.checked ?? 0,
    quotaHit: Boolean(data.quotaHit),
  };
}

// Quét mọi rule active của user (khi mở app). Cron lo phần nền 24/7.
export async function runMonitorForActiveRules(userId: string): Promise<MonitorResult> {
  const data = await invokeRunMonitor<Partial<MonitorResult>>({ userId });
  return {
    inserted: data.inserted ?? 0,
    checked: data.checked ?? 0,
    quotaHit: Boolean(data.quotaHit),
  };
}

// Soi bản nháp bằng dữ liệu thật nhưng không lưu rule/notification. Có ruleId khi preview chỉnh sửa.
export async function previewRule(
  draft: Record<string, unknown>,
  ruleId?: string,
): Promise<RulePreviewResult> {
  return invokeRunMonitor<RulePreviewResult>({ previewRule: draft, ...(ruleId ? { ruleId } : {}) });
}
