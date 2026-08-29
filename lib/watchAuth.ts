import { supabase } from "./supabase";

// Cookie/Authorization không ghi trực tiếp vào bảng rules. RPC mã hóa bằng khóa trong
// Supabase Vault; client chỉ nhận true/false, không đọc lại secret đã lưu.
export async function setRuleWatchAuth(ruleId: string, raw: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("set_rule_watch_auth", {
    p_rule_id: ruleId,
    p_auth: raw.trim(),
  });
  if (error) throw new Error(error.message);
  return data === true;
}

