// DEPLOY + PROBE gộp làm một — để KHÔNG BAO GIỜ quên bước probe sau deploy.
//
// Dùng:
//   node scripts/deploy-functions.mjs                 # deploy TẤT CẢ function rồi probe
//   node scripts/deploy-functions.mjs generate-rule   # chỉ deploy 1 (nhưng probe TẤT CẢ)
//   node scripts/deploy-functions.mjs run-monitor transcribe
//
// Vì sao probe TẤT CẢ dù chỉ deploy 1: sửa file trong _shared/* (gemini.ts, cors.ts...)
// ảnh hưởng MỌI function import nó — deploy 1 cái mà quên cái kia thì cái kia vẫn sập.
// Nhắc: nếu vừa sửa _shared/*, hãy deploy LẠI mọi function dùng nó (xem KE_HOACH.md).

import { spawnSync } from "node:child_process";

const PROJECT_REF = "idtibfiyfywcugdvlqal";
const ALL = ["generate-rule", "transcribe", "run-monitor", "admin-api"];

const args = process.argv.slice(2).filter(Boolean);
// Chỉ nhận tên function ĐÃ BIẾT — chặn gõ nhầm và chặn cả injection (tên đi vào lệnh shell).
const bad = args.filter((a) => !ALL.includes(a));
if (bad.length) {
  console.error(`Tên function không hợp lệ: ${bad.join(", ")}\nHợp lệ: ${ALL.join(", ")}`);
  process.exit(2);
}
const toDeploy = args.length ? args : ALL;

// CLI 2.109.1 deploy vẫn ổn; pin 2.109.0 chỉ là cẩn thận (đã kiểm 2026-07-08, không
// phải thủ phạm BOOT_ERROR — thủ phạm là lỗi code). Dùng bản cài sẵn cho nhanh.
// Truyền lệnh dạng CHUỖI + shell:true (không phải mảng args) để tránh cảnh báo DEP0190;
// mọi thành phần đã được kiểm ở trên nên an toàn.
console.log(`\n▶ Deploy: ${toDeploy.join(", ")}\n`);
const dep = spawnSync(
  `npx -y supabase@2.109.0 functions deploy ${toDeploy.join(" ")} --project-ref ${PROJECT_REF}`,
  { stdio: "inherit", shell: true },
);
if (dep.status !== 0) {
  console.error("\n⛔ Deploy lỗi — dừng, không probe.");
  process.exit(dep.status ?? 1);
}

// Chờ vài giây cho phiên bản mới lên rồi mới probe (tránh probe trúng bản đang lên).
console.log("\n⏳ Chờ 4s cho function khởi động lại rồi probe...");
await new Promise((r) => setTimeout(r, 4000));

console.log("\n▶ Probe TẤT CẢ function (kể cả cái không deploy — _shared/* dùng chung):");
const pr = spawnSync("node scripts/probe-functions.mjs", { stdio: "inherit", shell: true });
process.exit(pr.status ?? 0);
