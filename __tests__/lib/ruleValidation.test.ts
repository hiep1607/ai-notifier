import {
  normalizeVietnamReminder,
  validateAiRules,
} from "../../supabase/functions/_shared/ruleValidation";

const now = Date.parse("2026-07-15T03:00:00Z"); // 10:00 giờ VN

function validRule(overrides: Record<string, unknown> = {}) {
  return {
    title: "Tin AI mỗi sáng",
    description: "Cập nhật tin AI mỗi sáng.",
    keyword: "tin AI",
    category: "tech",
    sources: "",
    frequency: "1440",
    run_at: "8:00",
    condition: "",
    noise_risk: "low",
    noise_reason: "",
    source_type: "",
    remind_at: "",
    watch_url: "",
    ...overrides,
  };
}

describe("normalizeVietnamReminder", () => {
  it("chuẩn hóa giờ Việt Nam tương lai kèm offset", () => {
    expect(normalizeVietnamReminder("2026-07-15T10:05", now)).toBe("2026-07-15T10:05:00+07:00");
  });

  it("loại ngày không tồn tại và thời điểm đã qua", () => {
    expect(normalizeVietnamReminder("2026-02-30T09:00", now)).toBeNull();
    expect(normalizeVietnamReminder("2026-07-15T09:59", now)).toBeNull();
  });
});

describe("validateAiRules", () => {
  it("chuẩn hóa rule hợp lệ", () => {
    const result = validateAiRules([validRule()], now);
    expect(result.errors).toEqual([]);
    expect(result.rules[0]).toMatchObject({ category: "tech", frequency: "1440", run_at: "08:00" });
  });

  it("từ chối category, tần suất và giờ sai", () => {
    expect(validateAiRules([validRule({ category: "crypto" })], now).rules).toHaveLength(0);
    expect(validateAiRules([validRule({ frequency: "5" })], now).rules).toHaveLength(0);
    expect(validateAiRules([validRule({ run_at: "25:00" })], now).rules).toHaveLength(0);
    expect(validateAiRules([validRule({ frequency: "60", run_at: "08:00" })], now).rules).toHaveLength(0);
  });

  it("rule change bắt buộc có condition và không ghim giờ", () => {
    expect(validateAiRules([validRule({ frequency: "change", run_at: "", condition: "" })], now).rules).toHaveLength(0);
    expect(validateAiRules([validRule({ frequency: "change", run_at: "08:00", condition: "giảm 5%" })], now).rules).toHaveLength(0);
    expect(validateAiRules([validRule({ frequency: "change", run_at: "", condition: "giảm 5%" })], now).rules).toHaveLength(1);
  });

  it("nhắc hẹn phải ở tương lai; category được ép về other", () => {
    const good = validateAiRules([validRule({
      source_type: "reminder",
      remind_at: "2026-07-15T10:05",
      run_at: "",
      category: "news",
    })], now);
    expect(good.errors).toEqual([]);
    expect(good.rules[0]).toMatchObject({ source_type: "reminder", category: "other", remind_at: "2026-07-15T10:05:00+07:00" });
    expect(validateAiRules([validRule({ source_type: "reminder", remind_at: "2026-07-15T09:00", run_at: "" })], now).rules).toHaveLength(0);
  });

  it("URL watcher chặn scheme/IP nội bộ và nhận URL công khai", () => {
    expect(validateAiRules([validRule({ source_type: "url", watch_url: "http://127.0.0.1/x" })], now).rules).toHaveLength(0);
    expect(validateAiRules([validRule({ source_type: "url", watch_url: "https://example.com/x" })], now).rules).toHaveLength(1);
  });

  it("không chấp nhận một phần nếu bất kỳ rule nào sai hoặc vượt quá 5", () => {
    const mixed = validateAiRules([validRule(), validRule({ keyword: "" })], now);
    expect(mixed.rules).toHaveLength(1);
    expect(mixed.errors).toHaveLength(1);
    expect(validateAiRules(Array.from({ length: 6 }, () => validRule()), now).errors).toContain("Mỗi lần chỉ được tạo tối đa 5 rule.");
  });
});
