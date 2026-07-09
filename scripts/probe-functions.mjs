// SMOKE-PROBE cho Edge Functions — bắt lỗi BOOT_ERROR ngay sau khi deploy.
//
// Vì sao có file này: tsc/jest KHÔNG phủ code Deno của Edge Function. Một lỗi cú pháp
// (vd `const parts` khai báo 2 lần, 2026-07-08) lọt qua mọi test, deploy "thành công",
// nhưng function SẬP lúc boot (HTTP 503 {"code":"BOOT_ERROR"}) — và function cũ vẫn
// chạy bundle cũ nên lỗi ẩn nhiều ngày (transcribe chết âm thầm 3 ngày). Script này
// gọi thử TỪNG function bằng body RẺ (bị chặn ở tầng validate/auth TRƯỚC khi tốn quota
// hay làm việc thật) rồi khẳng định nó BOOT được. Chạy: node scripts/probe-functions.mjs
//
// PASS = nhận được phản hồi tầng ứng dụng (200/400/401/429... đều được — nghĩa là đã boot).
// FAIL = platform trả BOOT_ERROR / không boot / không gọi tới được.

import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const BASE = env.EXPO_PUBLIC_SUPABASE_URL;
const ANON = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
if (!BASE || !ANON) {
  console.error("Thiếu EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY trong .env");
  process.exit(2);
}

// Dùng process.exitCode + để event loop tự thoát (KHÔNG process.exit()): trên Windows/
// Node 24, gọi process.exit() lúc còn socket fetch đang đóng gây assertion crash
// (libuv UV_HANDLE_CLOSING → exit 127 thay vì 1). Header Connection:close để socket
// không nằm lại pool giữ event loop sống → script thoát ngay với đúng mã.

// Mỗi function + body RẺ (bị từ chối sớm, KHÔNG tốn quota Gemini / không làm việc thật):
//  - generate-rule: {} → 400 "Thiếu history" (trước khi gọi Gemini)
//  - transcribe / run-monitor / admin-api: chặn ở tầng auth → 401 (chưa làm gì)
const FUNCTIONS = [
  { name: "generate-rule", body: {} },
  { name: "transcribe", body: {} },
  { name: "run-monitor", body: {} },
  { name: "admin-api", body: { action: "usage" } },
];

// Function KHÔNG khỏe có 2 kiểu, đều do TẦNG NỀN TẢNG trả (không phải code ta viết):
//  - BOOT_ERROR (503): lỗi cú pháp/import → worker không tạo được (vd `const parts` 2 lần).
//  - WORKER_ERROR (500): module throw lúc khởi tạo → worker chết khi phục vụ.
// Dấu hiệu ĐÁNG TIN nhất: phản hồi nền tảng LUÔN có field `code`, còn MỌI response của
// code ta viết chỉ dùng `error`/`status`/`text`... (không bao giờ có `code`). Nên:
// có `code` = lỗi nền tảng = function hỏng. Giữ thêm regex text làm lưới phụ.
const PLATFORM_FAIL = /BOOT_ERROR|WORKER_ERROR|WORKER_LIMIT|WORKER_BOOT|Function failed to start|exited due to an error/i;

// Cho phép truyền danh sách function cần probe: node probe-functions.mjs generate-rule,transcribe
// Tên KHÔNG có trong FUNCTIONS (vd function mới / tạm) vẫn probe được với body rỗng.
const only = process.argv[2]?.split(",").map((s) => s.trim()).filter(Boolean);
const list = only?.length
  ? only.map((name) => FUNCTIONS.find((f) => f.name === name) ?? { name, body: {} })
  : FUNCTIONS;

async function probe(fn) {
  try {
    const res = await fetch(`${BASE}/functions/v1/${fn.name}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Connection: "close", // không giữ socket trong pool → event loop drain, thoát sạch
        apikey: ANON,
        Authorization: `Bearer ${ANON}`,
      },
      body: JSON.stringify(fn.body),
    });
    const text = await res.text();
    let code = "";
    try { code = JSON.parse(text)?.code ?? ""; } catch { /* body không phải JSON */ }
    // Có field `code` (lỗi nền tảng) HOẶC khớp regex = function hỏng.
    const bootFailed = Boolean(code) || PLATFORM_FAIL.test(text);
    return { ok: !bootFailed, http: res.status, snippet: text.slice(0, 120) };
  } catch (e) {
    // Không gọi tới được (mạng / DNS / function bị xóa) → coi như FAIL.
    return { ok: false, http: 0, snippet: String(e).slice(0, 120) };
  }
}

console.log(`\nProbe ${list.length} function trên ${BASE}\n`);
let failed = 0;
for (const fn of list) {
  const r = await probe(fn);
  const tag = r.ok ? "✅ BOOT OK" : "❌ SẬP";
  if (!r.ok) failed++;
  console.log(`${tag}  ${fn.name.padEnd(16)} HTTP ${String(r.http).padEnd(4)} ${r.snippet}`);
}

if (failed > 0) {
  console.error(`\n⛔ ${failed}/${list.length} function KHÔNG boot — xem lỗi ở trên (thường là lỗi cú pháp trong _shared/*).`);
  process.exitCode = 1; // để event loop tự thoát, tránh assertion crash trên Windows
} else {
  console.log(`\n✅ Tất cả ${list.length} function boot bình thường.`);
}
