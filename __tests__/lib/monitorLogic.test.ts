// Test logic THUẦN của run-monitor (supabase/functions/_shared/monitorLogic.ts).
// Đây là "não" của hệ thống quét (lịch, dedup, chọn tin) — trước đây nằm kẹt trong
// edge function nên không test được; giờ import cùng 1 file code chạy thật trên server.
import {
  intervalMs,
  isDue,
  dueAt,
  vnMinutesOfDay,
  isQuietNow,
  normTitle,
  normVal,
  isFillerTitle,
  recentRealTitles,
  isTooOld,
  pickFreshItem,
} from "../../supabase/functions/_shared/monitorLogic";

describe("intervalMs", () => {
  it("đổi số phút dạng chuỗi sang ms, tối thiểu 30 phút", () => {
    expect(intervalMs("60")).toBe(60 * 60000);
    expect(intervalMs("1440")).toBe(1440 * 60000);
    expect(intervalMs("5")).toBe(30 * 60000);   // dưới min → 30
    expect(intervalMs("abc")).toBe(30 * 60000); // rác → 30
    expect(intervalMs(undefined)).toBe(30 * 60000);
  });

  it("'change' = 60 phút (giãn nhịp né 429); khóa enum cũ vẫn map được", () => {
    expect(intervalMs("change")).toBe(60 * 60000);
    expect(intervalMs("daily")).toBe(1440 * 60000);
    expect(intervalMs("hourly")).toBe(60 * 60000);
  });
});

describe("isDue — chu kỳ thuần (không ghim giờ)", () => {
  const now = Date.parse("2026-07-01T10:00:00Z");

  it("tới hạn khi đã qua đủ 1 chu kỳ; chưa đủ thì chưa", () => {
    const oneHourAgo = new Date(now - 61 * 60000).toISOString();
    const tenMinAgo = new Date(now - 10 * 60000).toISOString();
    expect(isDue({ frequency: "60", last_run_at: oneHourAgo }, now)).toBe(true);
    expect(isDue({ frequency: "60", last_run_at: tenMinAgo }, now)).toBe(false);
  });

  it("rule chưa từng quét (last_run_at null) → tới hạn ngay", () => {
    expect(isDue({ frequency: "1440", last_run_at: null }, now)).toBe(true);
  });
});

describe("isDue — rule ghim giờ (run_at, giờ VN)", () => {
  // 10:00 UTC = 17:00 VN.
  const now = Date.parse("2026-07-01T10:00:00Z");
  const yesterday = new Date(now - 24 * 3600000).toISOString();

  it("bắn từ giờ hẹn; CHƯA tới giờ thì im", () => {
    expect(isDue({ frequency: "1440", run_at: "17:00", last_run_at: yesterday }, now)).toBe(true);
    expect(isDue({ frequency: "1440", run_at: "17:20", last_run_at: yesterday }, now)).toBe(false); // chưa tới giờ
  });

  it("CATCH-UP: lỡ lượt cron đúng giờ (quota/deadline) vẫn bắn lại trong 4 tiếng sau", () => {
    // Giờ hẹn 16:30, giờ hiện tại 17:00 (trễ 30') — trước đây khung 15' là MẤT NGUYÊN NGÀY.
    expect(isDue({ frequency: "1440", run_at: "16:30", last_run_at: yesterday }, now)).toBe(true);
    // Trễ 3h59' vẫn kịp; quá 4h thì bỏ mốc hôm nay.
    expect(isDue({ frequency: "1440", run_at: "13:01", last_run_at: yesterday }, now)).toBe(true);
    expect(isDue({ frequency: "1440", run_at: "12:59", last_run_at: yesterday }, now)).toBe(false);
  });

  it("chống bắn lặp: đã quét SAU mốc hẹn hôm nay thì các lượt catch-up sau im", () => {
    // Hẹn 16:30, đã quét thành công 16:31 → 17:00 không bắn nữa.
    const after = new Date(Date.parse("2026-07-01T09:31:00Z")).toISOString(); // 16:31 VN
    expect(isDue({ frequency: "1440", run_at: "16:30", last_run_at: after }, now)).toBe(false);
  });

  it("guard chu kỳ: rule hằng tuần không bắn lại mỗi ngày dù trong khung giờ", () => {
    expect(isDue({ frequency: "10080", run_at: "17:00", last_run_at: yesterday }, now)).toBe(false);
  });

  it("hôm qua bắn muộn (catch-up) không làm trượt mốc ĐÚNG GIỜ hôm nay", () => {
    // Hôm qua bắn lúc 20:00 (muộn 3h so với hẹn 17:00) → hôm nay 17:00 elapsed 21h ≥ 24h-5h.
    const lateYesterday = new Date(now - 21 * 3600000).toISOString();
    expect(isDue({ frequency: "1440", run_at: "17:00", last_run_at: lateYesterday }, now)).toBe(true);
  });
});

describe("dueAt — thứ tự ưu tiên quét", () => {
  it("rule trễ hẹn nặng hơn (dueAt nhỏ hơn) đứng trước khi sort", () => {
    const a = { frequency: "60", last_run_at: "2026-07-01T08:00:00Z" };  // đáng lẽ báo 09:00
    const b = { frequency: "1440", last_run_at: "2026-06-29T08:00:00Z" }; // đáng lẽ báo 30/6 08:00
    expect(dueAt(b)).toBeLessThan(dueAt(a)); // b trễ nặng hơn → lên đầu
  });
});

describe("giờ VN & giờ yên lặng", () => {
  it("vnMinutesOfDay: 10:30 UTC = 17:30 VN", () => {
    expect(vnMinutesOfDay(Date.parse("2026-07-01T10:30:00Z"))).toBe(17 * 60 + 30);
  });

  it("isQuietNow: khung thường và khung vắt qua nửa đêm", () => {
    expect(isQuietNow(9, 17, 12)).toBe(true);
    expect(isQuietNow(9, 17, 20)).toBe(false);
    expect(isQuietNow(22, 7, 23)).toBe(true);  // vắt nửa đêm
    expect(isQuietNow(22, 7, 3)).toBe(true);
    expect(isQuietNow(22, 7, 12)).toBe(false);
    expect(isQuietNow(8, 8, 8)).toBe(false);   // khung rỗng
  });
});

describe("chuẩn hóa & filler", () => {
  it("normTitle/normVal gộp khoảng trắng, hạ chữ", () => {
    expect(normTitle("  Giá VÀNG   hôm nay ")).toBe("giá vàng hôm nay");
    expect(normVal("75,2 Triệu / Lượng")).toBe("75,2triệu/lượng");
  });

  it("nhận diện tiêu đề filler hệ thống", () => {
    expect(isFillerTitle("Chưa có thay đổi mới: giá vàng")).toBe(true);
    expect(isFillerTitle("Gợi ý liên quan: bài X")).toBe(true);
    expect(isFillerTitle("Chưa tìm thấy thông tin: ABC")).toBe(true);
    expect(isFillerTitle("Vàng tăng mạnh lên 80 triệu")).toBe(false);
  });

  it("recentRealTitles: bỏ filler, giữ tối đa limit bài thật", () => {
    const titles = [
      "Chưa có thay đổi mới: giá vàng",
      "Vàng lên 80 triệu",
      "Gợi ý liên quan: bài X",
      "USD tăng giá",
      null,
      "Bài 3", "Bài 4", "Bài 5", "Bài 6", "Bài 7", "Bài 8", "Bài 9",
    ];
    const out = recentRealTitles(titles, 8);
    expect(out).toHaveLength(8);
    expect(out[0]).toBe("Vàng lên 80 triệu");
    expect(out[1]).toBe("USD tăng giá");
    expect(out.some((t) => t.startsWith("Chưa có") || t.startsWith("Gợi ý"))).toBe(false);
  });
});

describe("isTooOld — lọc bài quá cũ", () => {
  const now = Date.parse("2026-07-01T00:00:00Z");

  it("bài quá maxDays là cũ; trong hạn thì không", () => {
    expect(isTooOld("2026-06-20", 7, now)).toBe(true);   // 11 ngày
    expect(isTooOld("2026-06-28", 7, now)).toBe(false);  // 3 ngày
  });

  it("không rõ ngày / ngày rác → coi như KHÔNG cũ (giữ lại)", () => {
    expect(isTooOld("", 7, now)).toBe(false);
    expect(isTooOld(undefined, 7, now)).toBe(false);
    expect(isTooOld("hôm qua", 7, now)).toBe(false);
  });
});

describe("pickFreshItem — chọn bài chưa trùng (sửa gốc vòng lặp filler)", () => {
  const now = Date.parse("2026-07-01T00:00:00Z");
  const seen = new Set(["vàng lên 80 triệu"]);

  it("bài đầu trùng → nhảy sang bài 2 (trước đây chỉ nhìn bài đầu rồi bỏ)", () => {
    const items = [
      { title: "Vàng lên 80 triệu", value: "" },
      { title: "SJC nới biên độ mua bán", value: "" },
    ];
    const r = pickFreshItem(items, seen, "", 7, now);
    expect(r.fresh).toBe(true);
    expect(r.top?.title).toBe("SJC nới biên độ mua bán");
  });

  it("trùng tiêu đề nhưng SỐ LIỆU ĐỔI → vẫn coi là mới (chủ đề giá/thời tiết)", () => {
    const items = [{ title: "Vàng lên 80 triệu", value: "81 triệu/lượng" }];
    const r = pickFreshItem(items, seen, normVal("80 triệu/lượng"), 7, now);
    expect(r.fresh).toBe(true);
  });

  it("tất cả đều trùng → fresh=false nhưng vẫn trả bài đầu cho nhánh fallback", () => {
    const items = [{ title: "Vàng lên 80 triệu", value: "" }];
    const r = pickFreshItem(items, seen, "", 7, now);
    expect(r.fresh).toBe(false);
    expect(r.top?.title).toBe("Vàng lên 80 triệu");
  });

  it("bỏ bài quá cũ khi còn bài khác; mảng rỗng → không có top", () => {
    const items = [
      { title: "Bài cũ rích", value: "", published_date: "2026-06-01" },
      { title: "Bài mới", value: "", published_date: "2026-06-30" },
    ];
    const r = pickFreshItem(items, new Set<string>(), "", 7, now);
    expect(r.top?.title).toBe("Bài mới");
    expect(pickFreshItem([], new Set<string>(), "", 7, now).top).toBeUndefined();
  });

  it("tất cả bài đều 'quá cũ' → không vứt hết, vẫn xét như thường", () => {
    const items = [{ title: "Bài duy nhất", value: "", published_date: "2026-01-01" }];
    const r = pickFreshItem(items, new Set<string>(), "", 7, now);
    expect(r.top?.title).toBe("Bài duy nhất");
    expect(r.fresh).toBe(true);
  });
});
