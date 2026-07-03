// Bộ KỊCH BẢN kiểm thử đầu-cuối cho generate-rule (NL → Rule) trên server THẬT.
// Chạy: node scripts/scenario-test.mjs [--only=id1,id2]
// Mục đích: cho hệ thống "ăn" các yêu cầu đa dạng như người dùng thật để soi cách
// phân loại/xử lý (đúng loại rule? đúng URL? hỏi lại đúng lúc? từ chối đúng chỗ?).
// Chỉ tốn flash-lite (không grounding) — chạy thoải mái.

import { readFileSync, writeFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const URL_BASE = env.EXPO_PUBLIC_SUPABASE_URL;
const ANON = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// expect: hành vi ĐÚNG mong đợi (để người đọc chấm, script chỉ chấm phần máy chấm được).
const SCENARIOS = [
  // ── Nhóm 1: số liệu (provider) ──
  { id: "weather-time", prompt: "mỗi sáng 6h30 báo thời tiết Đà Nẵng", expect: "ready; định kỳ 1440 run_at 06:30" },
  { id: "crypto-cond", prompt: "báo khi ETH giảm hơn 5% trong ngày", expect: "ready; frequency=change + condition" },
  { id: "fx-daily", prompt: "tỷ giá USD hằng ngày lúc 9h", expect: "ready; 1440 run_at 09:00" },
  // ── Nhóm 2: tin tức ──
  { id: "news-broad", prompt: "tin tức công nghệ AI mỗi ngày", expect: "ready; noise_risk=high (chủ đề rộng)" },
  { id: "multi-rule", prompt: "mỗi sáng 7h báo giá vàng và thời tiết Hà Nội", expect: "ready; TÁCH 2 rule cùng 07:00" },
  // ── Nhóm 3: phải HỎI LẠI / TỪ CHỐI hợp lý ──
  { id: "vague", prompt: "theo dõi giá ETH", expect: "need_info: hỏi định kỳ hay theo điều kiện" },
  { id: "too-fast", prompt: "báo giá vàng mỗi 5 phút", expect: "need_info: giải thích min 30 phút, gợi ý theo điều kiện" },
  { id: "impossible", prompt: "báo tôi khi người yêu cũ đăng story instagram", expect: "need_info: từ chối khéo (instagram không đọc được)" },
  // ── Nhóm 4: nhắc hẹn ──
  { id: "remind-abs", prompt: "nhắc tôi họp lớp ngày 20/7 lúc 19h", expect: "ready; reminder remind_at=2026-07-20T19:00" },
  { id: "remind-rel", prompt: "nhắc tôi 10 phút nữa tắt máy giặt", expect: "ready; reminder = giờ hiện tại +10'" },
  { id: "remind-nodate", prompt: "nhắc tôi đi khám răng", expect: "need_info: hỏi ngày giờ" },
  // ── Nhóm 5: bản đồ nguồn (tự dựng URL, không cần link) ──
  { id: "gh-trending", prompt: "gửi tôi các dự án nổi bật trên github vào mỗi sáng", expect: "ready; url=github.com/trending, 1440+run_at" },
  { id: "gh-lang", prompt: "mỗi tuần tổng hợp dự án Python hot trên github", expect: "ready; url=github.com/trending/python?since=weekly" },
  { id: "gh-release", prompt: "báo tôi khi expo/expo ra bản mới", expect: "ready; url=github.com/expo/expo/releases.atom" },
  { id: "reddit", prompt: "bài hot trên r/vietnam mỗi tối 8h", expect: "ready; url=reddit.com/r/vietnam/.rss, run_at 20:00" },
  { id: "telegram", prompt: "theo dõi kênh telegram durov, có bài mới thì báo", expect: "ready; url=t.me/s/durov" },
  { id: "youtube-handle", prompt: "kênh youtube @MixiGaming có video mới thì báo tôi", expect: "need_info: xin link kênh (không tự suy ra channel_id)" },
  // ── Nhóm 6: MXH không hỗ trợ → từ chối + gợi ý ──
  { id: "facebook", prompt: "theo dõi facebook của Sơn Tùng MTP", expect: "need_info: giải thích FB chặn + gợi ý YouTube/Telegram" },
  { id: "tiktok", prompt: "báo tôi khi kênh tiktok của Lê Bống có video mới", expect: "need_info: TikTok chặn + gợi ý thay thế" },
  { id: "x-twitter", prompt: "theo dõi twitter của elonmusk", expect: "need_info: X đọc phải trả phí API" },
  // ── Nhóm 7: URL cụ thể người dùng đưa ──
  { id: "url-price", prompt: "báo khi sản phẩm này giảm dưới 500 nghìn https://shop.example.vn/ao-khoac-nam", expect: "ready; url + change + condition <500k" },
  { id: "url-login", prompt: "theo dõi điểm của tôi trên https://portal.example.edu.vn/diem, có điểm mới thì báo", expect: "ready; url + message nhắc cấp quyền đăng nhập" },
  { id: "url-nolink", prompt: "theo dõi trạng thái đơn hàng shopee của tôi", expect: "need_info: xin link (và Shopee có thể không đọc được)" },
];

const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7).split(",");
const list = only ? SCENARIOS.filter((s) => only.includes(s.id)) : SCENARIOS;

// Retry 503/429 (lỗi tạm của Gemini) như client thật (lib/ruleAI cũng retry 3 lần).
async function callGenerateRule(prompt) {
  let out;
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`${URL_BASE}/functions/v1/generate-rule`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: ANON,
        Authorization: `Bearer ${ANON}`,
      },
      body: JSON.stringify({ history: [{ role: "user", content: prompt }] }),
    });
    out = { http: res.status, body: await res.json().catch(() => null) };
    const err = String(out.body?.error ?? "");
    if (!/503|429|overloaded|unavailable/i.test(err)) return out;
    await new Promise((r) => setTimeout(r, (attempt + 1) * 8000));
  }
  return out;
}

const brief = (r) =>
  `type=${r.source_type || "search"} kw="${r.keyword}" freq=${r.frequency}` +
  (r.run_at ? ` @${r.run_at}` : "") +
  (r.condition ? ` cond="${r.condition}"` : "") +
  (r.watch_url ? ` url=${r.watch_url}` : "") +
  (r.remind_at ? ` remind=${r.remind_at}` : "") +
  (r.noise_risk === "high" ? " [noise:high]" : "");

const results = [];
for (const s of list) {
  let out;
  try {
    out = await callGenerateRule(s.prompt);
  } catch (e) {
    out = { http: 0, body: { error: String(e) } };
  }
  const b = out.body ?? {};
  const line = {
    id: s.id,
    prompt: s.prompt,
    expect: s.expect,
    http: out.http,
    status: b.status ?? (b.error ? "ERROR" : "?"),
    message: (b.message ?? b.error ?? "").slice(0, 220),
    rules: (b.rules ?? []).map(brief),
  };
  results.push(line);
  console.log(`\n[${line.id}] "${s.prompt}"`);
  console.log(`  KỲ VỌNG: ${s.expect}`);
  console.log(`  KẾT QUẢ: ${line.status}${line.rules.length ? "" : ` — ${line.message}`}`);
  for (const r of line.rules) console.log(`    · ${r}`);
  await new Promise((r) => setTimeout(r, 1200)); // né rate-limit theo phút
}

writeFileSync(new URL("./scenario-results.json", import.meta.url), JSON.stringify(results, null, 2));
console.log(`\nĐã lưu ${results.length} kết quả vào scripts/scenario-results.json`);
