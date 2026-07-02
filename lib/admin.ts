// Tiện ích cho TRANG QUẢN TRỊ. Gọi Edge Function admin-api (server tự xác thực admin).
// Danh sách email admin ở client CHỈ để ẩn/hiện lối vào — bảo mật thật do server quyết định.
import { supabase } from "./supabase";

export const ADMIN_EMAILS = ["tonghiep1607@gmail.com"];

export function isAdminEmail(email?: string | null): boolean {
  return !!email && ADMIN_EMAILS.includes(email.toLowerCase());
}

export async function adminCall<T = unknown>(
  action: string,
  payload: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await supabase.functions.invoke("admin-api", {
    body: { action, ...payload },
  });
  if (error) {
    // supabase-js trả lỗi chung khi non-2xx; thông điệp thật nằm trong body {error}.
    let real: string | null = null;
    const ctx = (error as { context?: { json?: () => Promise<unknown> } }).context;
    if (ctx && typeof ctx.json === "function") {
      try {
        const b = (await ctx.json()) as { error?: unknown };
        if (b?.error) real = String(b.error);
      } catch { /* không đọc được body → dùng lỗi gốc */ }
    }
    throw real ? new Error(real) : error;
  }
  if (data && typeof data === "object" && "error" in data) {
    throw new Error(String((data as { error: unknown }).error));
  }
  return data as T;
}

export interface AdminOverview {
  users: number;
  rulesTotal: number;
  rulesActive: number;
  rulesMuted: number;
  notifTotal: number;
  notifToday: number;
  pushTokens: number;
}

export interface AdminRule {
  id: string;
  user_id: string;
  email: string;
  keyword: string;
  category?: string | null;
  frequency?: string | null;
  condition?: string | null;
  run_at?: string | null;
  last_run_at?: string | null;
  last_value?: string | null;
  muted?: boolean | null;
  is_active?: boolean | null;
  created_at?: string | null;
}

export interface AdminUser {
  id: string;
  email: string;
  created_at?: string | null;
  last_sign_in_at?: string | null;
  rules: number;
  notifications: number;
  last_activity?: string | null;
}

export interface AdminNotification {
  id: string;
  rule_id: string;
  keyword: string;
  email: string;
  title: string;
  ai_summary?: string | null;
  source?: string | null;
  source_url?: string | null;
  category?: string | null;
  sentiment?: string | null;
  is_important?: boolean | null;
  created_at?: string | null;
}

export interface AdminUserDetail {
  user: { id: string; email?: string; created_at?: string; last_sign_in_at?: string } | null;
  rules: AdminRule[];
  notifications: {
    id: string; rule_id: string; title: string; ai_summary?: string | null;
    category?: string | null; sentiment?: string | null; created_at?: string | null;
  }[];
  tokens: { token: string; platform?: string | null; created_at?: string | null }[];
  settings: { quiet_enabled?: boolean; quiet_start?: number; quiet_end?: number } | null;
}

export interface AdminUsage {
  available: boolean;
  today?: number;
  todayErrors?: number;
  limit?: number;
  days?: { date: string; total: number; errors: number }[];
  lastError?: string | null;
}

// Tin tạo ra cho 1 rule trong 1 lần quét thật (run_rule / run_cron).
export type RunNoteKind = "real" | "nochange" | "related" | "none" | "skipped";
export interface RunNote {
  keyword: string;
  title: string;
  kind: RunNoteKind;
}
export interface RunResult {
  inserted: number;
  checked: number;
  quotaHit: boolean;
  notes?: RunNote[];
}

// SOI BỘ LỌC RÁC: kết quả 1 lượt quét thử cho 1 rule — quyết định của CẢ 2 chế độ
// (Đầy đủ vs Chỉ tin quan trọng) với tin tìm được, KHÔNG ghi notification nào.
export interface GatePreview {
  gateCheck: true;
  keyword: string;
  currentMode: string;       // "all" | "important" — chế độ rule đang đặt
  provider?: string;         // nguồn chuyên biệt đã dùng: weather/crypto/fx ("" = Gemini search)
  found: boolean;            // Gemini có trả tin nào không
  candidateTitle: string;
  value: string;
  isImportant: boolean;
  matchesCondition: boolean;
  changed: boolean;
  fresh: boolean;            // không trùng tin đã có
  allKind: RunNoteKind;      // chế độ "Đầy đủ" sẽ tạo loại gì
  importantPushed: boolean;  // chế độ "Chỉ tin quan trọng" có báo không
  importantReason: string;   // vì sao chế độ "Chỉ tin quan trọng" bỏ
}

// Một dòng trong kế hoạch quét (dry-run): rule + thời điểm đáng lẽ phải báo.
export interface ScanPlanItem {
  order: number;
  id: string;
  keyword: string;
  frequency?: string | null;
  run_at?: string | null;
  last_run_at?: string | null;
  due_at: string;       // ISO: thời điểm rule này tới hạn (last_run_at + chu kỳ)
  overdue_ms: number;   // >0 = đã trễ; <0 = còn phải chờ
}

export interface ScanPreview {
  dryRun: true;
  now: string;
  total: number;
  dueCount: number;
  plan: ScanPlanItem[];     // rule tới hạn, theo thứ tự sẽ quét
  waiting: ScanPlanItem[];  // rule chưa tới hạn, sắp theo sắp tới hạn nhất
}

export interface AdminCronRun {
  id: number;
  created_at: string;
  trigger: string;
  rules_scanned: number;
  inserted: number;
  quota_hit: boolean;
  duration_ms: number;
  detail?: string | null;
}
