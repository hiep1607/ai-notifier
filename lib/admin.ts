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
  if (error) throw error;
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
