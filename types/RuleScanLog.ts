export type RuleScanStatus =
  | "sent"
  | "filtered"
  | "no_change"
  | "related"
  | "no_result"
  | "error"
  | "quota";

export interface RuleScanLog {
  id: number;
  rule_id: string;
  user_id: string;
  trigger: "cron" | "tick" | "manual" | "user";
  status: RuleScanStatus;
  reason: string;
  candidate_title: string;
  notification_count: number;
  started_at: string;
  finished_at: string;
  duration_ms: number;
}
