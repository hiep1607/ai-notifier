import { isWatchableUrl } from "./monitorLogic.ts";

export const RULE_CATEGORIES = ["finance", "news", "tech", "sports", "weather", "health", "other"] as const;
const CATEGORY_SET = new Set<string>(RULE_CATEGORIES);

export interface ValidatedRuleDraft {
  title: string;
  description: string;
  keyword: string;
  category: string;
  sources: string;
  frequency: string;
  run_at: string;
  condition: string;
  noise_risk: "low" | "high";
  noise_reason: string;
  source_type: "" | "reminder" | "url";
  remind_at: string;
  watch_url: string;
}

export interface RuleValidationResult {
  rules: ValidatedRuleDraft[];
  errors: string[];
}

function text(v: unknown, max: number): string {
  const value = Array.isArray(v) ? v.join(", ") : v == null ? "" : String(v);
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function normalizeRunAt(value: unknown): string | null {
  const raw = text(value, 10);
  if (!raw) return "";
  const match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function normalizeFrequency(value: unknown): { value: string; minutes: number | null } | null {
  const raw = text(value, 30).toLowerCase();
  if (raw === "change") return { value: "change", minutes: null };
  if (!/^\d+$/.test(raw)) return null;
  const minutes = Number(raw);
  if (!Number.isSafeInteger(minutes) || minutes < 30 || minutes > 525_600) return null;
  return { value: String(minutes), minutes };
}

// Parse đúng local time Việt Nam và round-trip để loại ngày giả như 30/02.
export function normalizeVietnamReminder(value: unknown, nowMs = Date.now()): string | null {
  const raw = String(value ?? "").trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) return null;
  const [, ys, mos, ds, hs, mis] = match;
  const [year, month, day, hour, minute] = [ys, mos, ds, hs, mis].map(Number);
  if (month < 1 || month > 12 || hour > 23 || minute > 59) return null;
  const instant = Date.UTC(year, month - 1, day, hour - 7, minute);
  const roundTrip = new Date(instant + 7 * 3600000);
  if (roundTrip.getUTCFullYear() !== year || roundTrip.getUTCMonth() + 1 !== month ||
    roundTrip.getUTCDate() !== day || roundTrip.getUTCHours() !== hour ||
    roundTrip.getUTCMinutes() !== minute || instant <= nowMs) return null;
  return `${ys}-${mos}-${ds}T${hs}:${mis}:00+07:00`;
}

export function validateAiRules(rawRules: unknown[], nowMs = Date.now()): RuleValidationResult {
  const rules: ValidatedRuleDraft[] = [];
  const errors: string[] = [];

  for (const [index, item] of rawRules.slice(0, 5).entries()) {
    const r = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const label = `Rule ${index + 1}`;
    const title = text(r.title, 100);
    const keyword = text(r.keyword, 200);
    const description = text(r.description, 500);
    const category = text(r.category, 30).toLowerCase();
    const condition = text(r.condition, 500);
    const frequency = normalizeFrequency(r.frequency);
    const runAt = normalizeRunAt(r.run_at);
    const requestedType = text(r.source_type, 20).toLowerCase();

    if (!title || !keyword || !description) { errors.push(`${label}: thiếu tiêu đề, mô tả hoặc từ khóa.`); continue; }
    if (!CATEGORY_SET.has(category)) { errors.push(`${label}: danh mục không hợp lệ.`); continue; }
    if (!frequency) { errors.push(`${label}: tần suất phải là "change" hoặc số phút từ 30 đến 525600.`); continue; }
    if (runAt === null) { errors.push(`${label}: giờ báo không hợp lệ.`); continue; }
    if (frequency.value === "change" && !condition) {
      errors.push(`${label}: theo dõi thay đổi phải có điều kiện cụ thể.`); continue;
    }
    if (frequency.value === "change" && runAt) {
      errors.push(`${label}: rule theo điều kiện không được ghim giờ.`); continue;
    }
    if (runAt && frequency.minutes != null && frequency.minutes < 1440) {
      errors.push(`${label}: chỉ rule hằng ngày/tuần mới được ghim giờ.`); continue;
    }

    let sourceType: ValidatedRuleDraft["source_type"] = "";
    let remindAt = "";
    let watchUrl = "";
    if (requestedType === "reminder") {
      remindAt = normalizeVietnamReminder(r.remind_at, nowMs) ?? "";
      if (!remindAt) { errors.push(`${label}: thời điểm nhắc không hợp lệ hoặc đã qua.`); continue; }
      sourceType = "reminder";
    } else if (requestedType === "url") {
      watchUrl = text(r.watch_url, 2_000);
      if (!isWatchableUrl(watchUrl)) { errors.push(`${label}: URL theo dõi không hợp lệ.`); continue; }
      sourceType = "url";
    } else if (requestedType && requestedType !== "search") {
      errors.push(`${label}: loại nguồn không hợp lệ.`); continue;
    }

    const rawRisk = text(r.noise_risk, 10).toLowerCase();
    const noiseRisk: "low" | "high" = sourceType === "reminder" || frequency.value === "change" || condition
      ? "low"
      : rawRisk === "high" ? "high" : "low";
    rules.push({
      title,
      description,
      keyword,
      category: sourceType === "reminder" ? "other" : category,
      sources: text(r.sources, 500),
      frequency: sourceType === "reminder" ? "1440" : frequency.value,
      run_at: sourceType === "reminder" ? "" : runAt,
      condition: sourceType === "reminder" ? "" : condition,
      noise_risk: noiseRisk,
      noise_reason: noiseRisk === "high" ? text(r.noise_reason, 300) : "",
      source_type: sourceType,
      remind_at: remindAt,
      watch_url: watchUrl,
    });
  }

  if (rawRules.length > 5) errors.push("Mỗi lần chỉ được tạo tối đa 5 rule.");
  return { rules, errors };
}
