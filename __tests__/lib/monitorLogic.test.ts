// Test logic THUẦN của run-monitor (supabase/functions/_shared/monitorLogic.ts).
// Đây là "não" của hệ thống quét (lịch, dedup, chọn tin) — trước đây nằm kẹt trong
// edge function nên không test được; giờ import cùng 1 file code chạy thật trên server.
import {
  intervalMs,
  isDue,
  isTickDue,
  dueAt,
  scanTier,
  contentFingerprint,
  normLink,
  vnMinutesOfDay,
  isQuietNow,
  normTitle,
  normVal,
  isFillerTitle,
  recentRealTitles,
  isTooOld,
  pickFreshItem,
  detectSourceType,
  matchCoin,
  extractWeatherLocation,
  wmoDesc,
  significantChange,
  composeWeatherNotif,
  composeCryptoNotif,
  composeFxNotif,
  extractWatchUrl,
  isPrivateHost,
  isWatchableUrl,
  parseWatchAuth,
  stripHtml,
  discoverFeedUrl,
  extractPageLinks,
  normalizeWatchUrl,
  looksLikeFeed,
} from "../../supabase/functions/_shared/monitorLogic";
import { parseRss } from "../../supabase/functions/_shared/rss";

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

  // Fix "thời tiết 8h bắn lúc 10h" (2026-07-04): hôm trước bắn muộn do sự cố nền →
  // last+24h đẩy rule ghim giờ xuống cuối hàng đợi đúng lúc 8h sáng hôm sau.
  it("rule GHIM GIỜ trong khung bắn: hạn = MỐC HẸN hôm nay, không phải last+chu kỳ", () => {
    const now9vn = Date.parse("2026-07-04T02:00:00Z"); // 09:00 VN
    // Hôm qua bắn muộn lúc 10:00 VN (03:00Z) — nếu tính last+24h thì hạn = 10:00 hôm nay.
    const weather = { frequency: "1440", run_at: "08:00", last_run_at: "2026-07-03T03:00:00Z" };
    expect(dueAt(weather, now9vn)).toBe(Date.parse("2026-07-04T01:00:00Z")); // = 08:00 VN
  });

  it("scanTier: nhắc hẹn < rule ghim giờ < định kỳ trơn", () => {
    const reminder = { frequency: "1440", source_type: "reminder", remind_at: "2026-07-04T08:00:00+07:00" };
    const scheduled = { frequency: "1440", run_at: "08:00" };
    const plain = { frequency: "60" };
    expect(scanTier(reminder)).toBeLessThan(scanTier(scheduled));
    expect(scanTier(scheduled)).toBeLessThan(scanTier(plain));
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

describe("isDue — rule NHẮC HẸN (reminder)", () => {
  const now = Date.parse("2026-07-20T02:00:00Z"); // 09:00 VN 20/7

  it("tới hạn khi ĐÃ QUA remind_at và chưa quét sau mốc đó; nhắc muộn vẫn bắn", () => {
    const r = { frequency: "1440", source_type: "reminder", remind_at: "2026-07-20T09:00:00+07:00" };
    expect(isDue({ ...r, last_run_at: "2026-07-19T00:00:00Z" }, now)).toBe(true);       // đúng hẹn
    expect(isDue({ ...r, last_run_at: "2026-07-19T00:00:00Z" }, now - 3600000)).toBe(false); // chưa tới giờ
    expect(isDue({ ...r, last_run_at: null }, now + 26 * 3600000)).toBe(true);          // muộn 1 ngày vẫn nhắc
  });

  it("đã quét SAU mốc hẹn → không bắn lại", () => {
    const r = { frequency: "1440", source_type: "reminder", remind_at: "2026-07-20T09:00:00+07:00" };
    expect(isDue({ ...r, last_run_at: "2026-07-20T02:05:00Z" }, now + 3600000)).toBe(false);
  });

  it("reminder thiếu/hỏng remind_at → rơi về lịch thường (không crash)", () => {
    expect(isDue({ frequency: "1440", source_type: "reminder", remind_at: "ngày mai", last_run_at: null }, now)).toBe(true); // fallback chu kỳ thuần: chưa quét lần nào → due
  });

  it("dueAt của reminder = đúng mốc hẹn → tới hạn thì lên ĐẦU hàng đợi quét", () => {
    const remindMs = Date.parse("2026-07-20T09:00:00+07:00");
    const reminder = { frequency: "1440", source_type: "reminder", remind_at: "2026-07-20T09:00:00+07:00", last_run_at: null };
    expect(dueAt(reminder)).toBe(remindMs);
    // Rule tin tức quét 30' trước (dueAt ≈ now) vẫn xếp SAU reminder đã tới hạn 1 tiếng.
    const newsRule = { frequency: "60", last_run_at: new Date(remindMs).toISOString() };
    expect(dueAt(reminder)).toBeLessThan(dueAt(newsRule));
  });

  it("nhắc hẹn RẤT GẦN (5 phút nữa) — chưa tới thì im, tới là bắn (không có giới hạn 30')", () => {
    const in5min = new Date(now + 5 * 60000).toISOString();
    const r = { frequency: "1440", source_type: "reminder", remind_at: in5min, last_run_at: null };
    expect(isDue(r, now)).toBe(false);              // còn 5 phút → chưa
    expect(isDue(r, now + 5 * 60000)).toBe(true);   // đúng mốc → bắn
    expect(isDue(r, now + 6 * 60000)).toBe(true);   // trễ 1 phút → vẫn bắn
  });
});

describe("detectSourceType — router chọn nguồn dữ liệu", () => {
  it("thời tiết → weather", () => {
    expect(detectSourceType("dự báo thời tiết Thanh Hóa hôm nay")).toBe("weather");
    expect(detectSourceType("thời tiết Hà Nội")).toBe("weather");
  });

  it("giá coin → crypto; TIN TỨC về coin vẫn là search (không cướp rule tin tức)", () => {
    expect(detectSourceType("giá Bitcoin BTC hôm nay")).toBe("crypto");
    expect(detectSourceType("giá ETH Ethereum")).toBe("crypto");
    expect(detectSourceType("tin tức bitcoin mới nhất")).toBe("search");
  });

  it("tỷ giá → fx; giá vàng/xăng KHÔNG có provider → search", () => {
    expect(detectSourceType("tỷ giá USD/VND hôm nay")).toBe("fx");
    expect(detectSourceType("giá vàng SJC hôm nay")).toBe("search");
    expect(detectSourceType("giá xăng dầu Việt Nam")).toBe("search");
  });

  it("chủ đề tự do / rỗng → search", () => {
    expect(detectSourceType("tin công nghệ AI")).toBe("search");
    expect(detectSourceType("")).toBe("search");
    expect(detectSourceType(undefined)).toBe("search");
  });
});

describe("matchCoin & extractWeatherLocation", () => {
  it("nhận diện coin theo tên/ký hiệu, không dính từ chứa chuỗi con", () => {
    expect(matchCoin("giá bitcoin")?.id).toBe("bitcoin");
    expect(matchCoin("giá ETH")?.id).toBe("ethereum");
    expect(matchCoin("method testing")).toBeNull(); // "eth" trong "method" không tính
  });

  it("tách địa danh khỏi keyword thời tiết", () => {
    expect(extractWeatherLocation("dự báo thời tiết Thanh Hóa hôm nay")).toBe("Thanh Hóa");
    expect(extractWeatherLocation("thời tiết Hà Nội ngày mai")).toBe("Hà Nội");
    expect(extractWeatherLocation("thời tiết")).toBe(""); // không còn gì → caller fallback search
  });
});

describe("wmoDesc & significantChange", () => {
  it("map mã WMO sang tiếng Việt", () => {
    expect(wmoDesc(0)).toBe("Trời quang");
    expect(wmoDesc(3)).toBe("Nhiều mây");
    expect(wmoDesc(63)).toBe("Mưa");
    expect(wmoDesc(95)).toBe("Dông");
    expect(wmoDesc(1234)).toBe("Không rõ");
  });

  it("significantChange: so % trên số đứng đầu; không parse được → coi là ĐỔI", () => {
    expect(significantChange("100 USD", "102 USD", 1)).toBe(true);   // +2%
    expect(significantChange("100 USD", "100.5 USD", 1)).toBe(false); // +0.5%
    expect(significantChange(null, "100 USD", 1)).toBe(true);        // chưa có mốc
    expect(significantChange("75,2 triệu/lượng", "100 USD", 1)).toBe(true); // format cũ lệch → đổi
  });
});

describe("compose bản tin provider", () => {
  const now = Date.parse("2026-07-02T02:00:00Z"); // 09:00 VN ngày 02/07

  it("thời tiết: tiêu đề có địa danh + NGÀY (unique mỗi ngày), nội dung đủ số liệu", () => {
    const today = { code: 80, tmax: 33, tmin: 25, rainPct: 70, windMax: 12 };
    const p = composeWeatherNotif("Thanh Hóa", 29, 3, today, { code: 61, tmax: 31, tmin: 24, rainPct: 90, windMax: 15 }, now);
    expect(p.title).toBe("Thời tiết Thanh Hóa 02/07: Mưa rào, 25–33°C");
    expect(p.content).toContain("Hiện tại 29°C");
    expect(p.content).toContain("xác suất mưa 70%");
    expect(p.details).toContain("Ngày mai: Mưa");
    expect(p.value).toContain("25-33°C");
    expect(p.source).toBe("Open-Meteo");
  });

  it("crypto: giá USD + quy đổi VND + biến động 24h; value là số máy-đọc", () => {
    const p = composeCryptoNotif("bitcoin", "Bitcoin", 67123.45, 1700000000, -2.34);
    expect(p.title).toContain("Bitcoin");
    expect(p.title).toContain("-2.34% 24h");
    expect(p.content).toContain("CoinGecko");
    expect(p.value).toBe("67123.45 USD");
    expect(p.source_url).toContain("coingecko.com/en/coins/bitcoin");
  });

  it("tỷ giá: nêu chênh so với lần trước nếu có mốc cũ", () => {
    const p = composeFxNotif(26150, "26100 VND");
    expect(p.title).toContain("USD/VND");
    expect(p.content).toContain("lần trước");
    expect(p.value).toBe("26150 VND");
    // Chưa có mốc cũ → không nêu chênh.
    expect(composeFxNotif(26150, null).content).not.toContain("lần trước");
  });
});

// ---------- THEO DÕI TRANG WEB CỤ THỂ (Pha E) ----------

describe("extractWatchUrl & detectSourceType 'url'", () => {
  it("lấy URL đầu tiên trong text, cắt dấu câu bám đuôi", () => {
    expect(extractWatchUrl("theo dõi https://shop.vn/ao-khoac nhé")).toBe("https://shop.vn/ao-khoac");
    expect(extractWatchUrl("xem trang https://a.com/x?p=1&q=2.")).toBe("https://a.com/x?p=1&q=2");
    expect(extractWatchUrl("không có link nào")).toBe("");
    expect(extractWatchUrl(undefined)).toBe("");
  });

  it("keyword chứa URL → source_type 'url' (thắng cả heuristic thời tiết)", () => {
    expect(detectSourceType("giá áo https://shop.vn/ao")).toBe("url");
    expect(detectSourceType("thời tiết https://weather.example.com/hn")).toBe("url");
    expect(detectSourceType("thời tiết Hà Nội")).toBe("weather"); // không URL → như cũ
  });
});

describe("isPrivateHost & isWatchableUrl (chống SSRF)", () => {
  it("chặn localhost/IP nội bộ/metadata", () => {
    expect(isPrivateHost("localhost")).toBe(true);
    expect(isPrivateHost("127.0.0.1")).toBe(true);
    expect(isPrivateHost("10.0.0.5")).toBe(true);
    expect(isPrivateHost("192.168.1.1")).toBe(true);
    expect(isPrivateHost("172.20.3.4")).toBe(true);
    expect(isPrivateHost("169.254.169.254")).toBe(true); // cloud metadata
    expect(isPrivateHost("db.internal")).toBe(true);
    expect(isPrivateHost("vnexpress.net")).toBe(false);
    expect(isPrivateHost("172.32.0.1")).toBe(false); // ngoài dải 172.16-31
  });

  it("chỉ nhận http/https tới host công khai", () => {
    expect(isWatchableUrl("https://shop.vn/x")).toBe(true);
    expect(isWatchableUrl("http://example.com")).toBe(true);
    expect(isWatchableUrl("ftp://example.com")).toBe(false);
    expect(isWatchableUrl("https://127.0.0.1/admin")).toBe(false);
    expect(isWatchableUrl("không phải url")).toBe(false);
  });
});

describe("parseWatchAuth", () => {
  it("dòng 'Header: value' → header; dòng trần → Cookie", () => {
    expect(parseWatchAuth("Authorization: Bearer abc\nX-Api-Key: k1")).toEqual({
      Authorization: "Bearer abc",
      "X-Api-Key": "k1",
    });
    expect(parseWatchAuth("session=abc; user=1")).toEqual({ Cookie: "session=abc; user=1" });
    // Trộn: dòng header + dòng cookie trần.
    expect(parseWatchAuth("Authorization: Bearer t\nsession=abc")).toEqual({
      Authorization: "Bearer t",
      Cookie: "session=abc",
    });
    expect(parseWatchAuth("")).toEqual({});
    expect(parseWatchAuth(null)).toEqual({});
  });
});

describe("stripHtml", () => {
  it("bỏ script/style/tag, decode entity, gọn khoảng trắng", () => {
    const html = `<html><head><style>.x{color:red}</style><script>alert(1)</script></head>
      <body><h1>Giá &amp; khuyến mãi</h1><p>1.250.000&nbsp;đ</p><div>Còn hàng</div></body></html>`;
    const text = stripHtml(html);
    expect(text).toContain("Giá & khuyến mãi");
    expect(text).toContain("1.250.000 đ");
    expect(text).toContain("Còn hàng");
    expect(text).not.toContain("alert(1)");
    expect(text).not.toContain("color:red");
    expect(text).not.toContain("<p>");
  });

  it("cắt trần độ dài để vừa prompt AI", () => {
    expect(stripHtml("a".repeat(20000), 12000).length).toBe(12000);
  });
});

describe("discoverFeedUrl — feed trang tự khai báo", () => {
  it("bắt link rel=alternate type=rss+xml, resolve URL tương đối", () => {
    const html = `<head>
      <link rel="alternate" href="https://x.vn/vi" hreflang="vi-vn"/>
      <link rel="alternate" type="application/rss+xml" href="/cong-nghe.rss" title="CN" />
    </head>`;
    expect(discoverFeedUrl(html, "https://tuoitre.vn/cong-nghe.htm")).toBe("https://tuoitre.vn/cong-nghe.rss");
  });

  it("không có feed khai báo (chỉ alternate hreflang) → chuỗi rỗng", () => {
    const html = `<link rel="alternate" href="https://vnexpress.net/kinh-doanh" hreflang="vi-vn"/>`;
    expect(discoverFeedUrl(html, "https://vnexpress.net/kinh-doanh")).toBe("");
    expect(discoverFeedUrl("", "https://a.com")).toBe("");
  });

  it("nhận cả atom+xml và href tuyệt đối", () => {
    const html = `<link type="application/atom+xml" rel="alternate" href="https://blog.vn/atom.xml">`;
    expect(discoverFeedUrl(html, "https://blog.vn/post")).toBe("https://blog.vn/atom.xml");
  });
});

describe("extractPageLinks — link bài viết trên trang", () => {
  const html = `
    <a href="/menu">Menu</a>
    <a href="/bai-1.html"><h3>Giá vàng SJC sáng nay tăng vọt lên 82 triệu</h3></a>
    <a href="https://x.vn/bai-2">Tỷ giá USD ngân hàng đồng loạt giảm mạnh</a>
    <a href="/bai-1.html">Giá vàng SJC sáng nay tăng vọt lên 82 triệu</a>
    <a href="javascript:void(0)">Bài viết có link javascript không hợp lệ nhé</a>`;

  it("giữ anchor text dài (tiêu đề bài), resolve tương đối, bỏ trùng + link rác", () => {
    const links = extractPageLinks(html, "https://x.vn/kinh-doanh");
    expect(links).toHaveLength(2);
    expect(links[0]).toEqual({
      text: "Giá vàng SJC sáng nay tăng vọt lên 82 triệu",
      url: "https://x.vn/bai-1.html",
    });
    expect(links[1].url).toBe("https://x.vn/bai-2");
  });

  it("bỏ anchor ngắn (menu/nút); tôn trọng max", () => {
    expect(extractPageLinks(`<a href="/a">Ngắn</a>`, "https://x.vn")).toHaveLength(0);
    expect(extractPageLinks(html, "https://x.vn", 1)).toHaveLength(1);
  });
});

describe("normalizeWatchUrl — quy đổi link MXH dạng thường sang link đọc được", () => {
  it("t.me/kênh → t.me/s/kênh; đã /s/ hoặc link mời thì giữ nguyên", () => {
    expect(normalizeWatchUrl("https://t.me/telegram")).toBe("https://t.me/s/telegram");
    expect(normalizeWatchUrl("https://t.me/s/telegram")).toBe("https://t.me/s/telegram");
    expect(normalizeWatchUrl("https://t.me/+Abc123")).toBe("https://t.me/+Abc123");
  });

  it("reddit sub/user → .rss", () => {
    expect(normalizeWatchUrl("https://www.reddit.com/r/vietnam")).toBe("https://www.reddit.com/r/vietnam/.rss");
    expect(normalizeWatchUrl("https://reddit.com/r/vietnam/")).toBe("https://www.reddit.com/r/vietnam/.rss");
    expect(normalizeWatchUrl("https://old.reddit.com/user/spez")).toBe("https://www.reddit.com/user/spez/.rss");
    // Link bài viết cụ thể (sâu hơn 2 cấp) → giữ nguyên.
    expect(normalizeWatchUrl("https://www.reddit.com/r/vietnam/comments/abc/x")).toBe("https://www.reddit.com/r/vietnam/comments/abc/x");
  });

  it("bsky profile → /rss; youtube /channel/UC… → feed videos.xml", () => {
    expect(normalizeWatchUrl("https://bsky.app/profile/bsky.app")).toBe("https://bsky.app/profile/bsky.app/rss");
    expect(normalizeWatchUrl("https://www.youtube.com/channel/UCBR8-60-B28hp2BmDPdntcQ"))
      .toBe("https://www.youtube.com/feeds/videos.xml?channel_id=UCBR8-60-B28hp2BmDPdntcQ");
    // @handle không suy ra channel_id được → giữ nguyên.
    expect(normalizeWatchUrl("https://www.youtube.com/@MixiGaming")).toBe("https://www.youtube.com/@MixiGaming");
  });

  it("trang thường / chuỗi rác → giữ nguyên", () => {
    expect(normalizeWatchUrl("https://vnexpress.net/kinh-doanh")).toBe("https://vnexpress.net/kinh-doanh");
    expect(normalizeWatchUrl("không phải url")).toBe("không phải url");
  });
});

describe("looksLikeFeed — body là feed XML hay trang HTML", () => {
  it("nhận rss/atom, từ chối html", () => {
    expect(looksLikeFeed('<?xml version="1.0"?><rss version="2.0"><channel>')).toBe(true);
    expect(looksLikeFeed('<feed xmlns="http://www.w3.org/2005/Atom"><entry>')).toBe(true);
    expect(looksLikeFeed("<!doctype html><html><head><rss-widget>")).toBe(false);
    expect(looksLikeFeed("chỉ là text thường")).toBe(false);
  });
});

describe("parseRss — hỗ trợ ATOM (Reddit/YouTube/GitHub)", () => {
  it("entry Atom: link ở attribute href (ưu tiên rel=alternate), summary/updated", () => {
    const atom = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
      <entry>
        <title>Expo SDK 53</title>
        <link rel="alternate" href="https://github.com/expo/expo/releases/tag/sdk-53"/>
        <summary>Bản phát hành mới với nhiều cải tiến lớn cho web</summary>
        <updated>2026-07-01T00:00:00Z</updated>
      </entry>
      <entry>
        <title>Video mới</title>
        <link href="https://www.youtube.com/watch?v=abc123"/>
        <media:description>Mô tả video</media:description>
        <published>2026-07-02T00:00:00Z</published>
      </entry>
    </feed>`;
    const items = parseRss(atom);
    expect(items).toHaveLength(2);
    expect(items[0].title).toBe("Expo SDK 53");
    expect(items[0].link).toBe("https://github.com/expo/expo/releases/tag/sdk-53");
    expect(items[0].description).toContain("cải tiến lớn");
    expect(items[1].link).toBe("https://www.youtube.com/watch?v=abc123");
    expect(items[1].pubDate).toBe("2026-07-02T00:00:00Z");
  });

  it("RSS 2.0 cũ vẫn parse như trước (không vỡ đường RSS báo VN)", () => {
    const rss = `<rss><channel><item><title>Bài A</title><link>https://x.vn/a</link><description>Mô tả A</description><pubDate>Wed, 01 Jul 2026 00:00:00 +0700</pubDate></item></channel></rss>`;
    const items = parseRss(rss);
    expect(items).toHaveLength(1);
    expect(items[0].link).toBe("https://x.vn/a");
  });
});

// ---------- TICK MỖI PHÚT (0022): nhắc hẹn + rule ghim giờ đúng giờ ±1' ----------

describe("isTickDue — rule nào được tick mỗi phút xử lý", () => {
  // 01:00 UTC = 08:00 VN.
  const now = Date.parse("2026-07-01T01:00:00Z");
  const yesterday = new Date(now - 24 * 3600000).toISOString();

  it("nhắc hẹn tới hạn → true; chưa tới giờ → false", () => {
    const past = new Date(now - 60000).toISOString();
    const future = new Date(now + 60000).toISOString();
    expect(isTickDue({ source_type: "reminder", remind_at: past, last_run_at: null }, now)).toBe(true);
    expect(isTickDue({ source_type: "reminder", remind_at: future, last_run_at: null }, now)).toBe(false);
  });

  it("rule ghim giờ ĐÚNG mốc / trong cửa sổ 10 phút → true", () => {
    expect(isTickDue({ frequency: "1440", run_at: "8:00", last_run_at: yesterday }, now)).toBe(true);
    expect(isTickDue({ frequency: "1440", run_at: "07:55", last_run_at: yesterday }, now)).toBe(true); // trễ 5'
  });

  it("quá cửa sổ 10 phút → false (phần catch-up 4h để cron chính 15' lo như cũ)", () => {
    expect(isTickDue({ frequency: "1440", run_at: "07:45", last_run_at: yesterday }, now)).toBe(false);
    // isDue thì vẫn true (catch-up) — chứng minh tick hẹp hơn isDue có chủ đích.
    expect(isDue({ frequency: "1440", run_at: "07:45", last_run_at: yesterday }, now)).toBe(true);
  });

  it("đã quét sau mốc hôm nay → false (không bắn đúp với cron chính)", () => {
    const justScanned = new Date(now - 30000).toISOString(); // quét 30s trước, sau mốc 8:00
    expect(isTickDue({ frequency: "1440", run_at: "08:00", last_run_at: justScanned }, now)).toBe(false);
  });

  it("rule định kỳ trơn / rule điều kiện → KHÔNG BAO GIỜ vào tick", () => {
    expect(isTickDue({ frequency: "30", last_run_at: null }, now)).toBe(false);
    expect(isTickDue({ frequency: "change", run_at: "08:00", last_run_at: yesterday }, now)).toBe(false);
  });
});

// ---------- HASH-GATE (0023): trang y nguyên thì khỏi gọi AI ----------

describe("contentFingerprint — vân tay nội dung trang", () => {
  it("cùng nội dung → cùng vân tay; khác khoảng trắng vẫn coi là cùng", () => {
    expect(contentFingerprint("Giá vàng 75,2 triệu")).toBe(contentFingerprint("Giá  vàng\n 75,2  triệu "));
  });

  it("nội dung khác (dù chỉ 1 số) → vân tay khác", () => {
    expect(contentFingerprint("Giá vàng 75,2 triệu")).not.toBe(contentFingerprint("Giá vàng 75,3 triệu"));
  });

  it("chuỗi rỗng vẫn trả vân tay hợp lệ (không throw)", () => {
    expect(typeof contentFingerprint("")).toBe("string");
    expect(contentFingerprint("").length).toBeGreaterThan(0);
  });
});

// ---------- CHỐNG TRÙNG THEO LINK (lớp 2 bên cạnh normTitle) ----------

describe("normLink — chuẩn hóa URL bài viết", () => {
  it("bỏ scheme/www/fragment/trailing slash → cùng bài nhận ra nhau", () => {
    expect(normLink("https://www.vnexpress.net/bai-viet-123.html#comment"))
      .toBe(normLink("http://vnexpress.net/bai-viet-123.html/"));
  });

  it("bỏ param tracking (utm_*, fbclid...) nhưng GIỮ param nội dung", () => {
    expect(normLink("https://a.vn/p?id=9&utm_source=fb&fbclid=xyz")).toBe("a.vn/p?id=9");
    expect(normLink("https://a.vn/p?id=9")).not.toBe(normLink("https://a.vn/p?id=10"));
  });

  it("sort query còn lại → khác thứ tự param vẫn nhận là cùng bài", () => {
    expect(normLink("https://a.vn/p?b=2&a=1")).toBe(normLink("https://a.vn/p?a=1&b=2"));
  });

  it("không phải URL http(s) → chuỗi rỗng (caller bỏ qua lớp link)", () => {
    expect(normLink("")).toBe("");
    expect(normLink("mailto:x@y.z")).toBe("");
    expect(normLink("không phải url")).toBe("");
  });
});
