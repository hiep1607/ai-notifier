// Tự cập nhật bản web: phát hiện deploy mới rồi nạp lại, đỡ phải xoá cache + reload tay.
// Chỉ chạy trên web. Cách hoạt động: định kỳ tải lại index.html (no-store, bỏ qua cache),
// trích "chữ ký" các file bundle băm (hash) trong HTML; nếu khác bản đang chạy => có bản mới.
import { Platform } from "react-native";

let started = false;
let baseline: string | null = null;

// Lấy danh sách file js/css băm trong HTML làm chữ ký 1 bản build.
function extractBundleSig(html: string): string {
  const scripts = Array.from(
    html.matchAll(/<script[^>]+src=["']([^"']+)["']/g),
  ).map((m) => m[1]);
  const links = Array.from(
    html.matchAll(/<link[^>]+href=["']([^"']+\.(?:js|css))["']/g),
  ).map((m) => m[1]);
  return [...scripts, ...links].filter(Boolean).sort().join("|");
}

async function fetchSig(): Promise<string | null> {
  try {
    // query ?v= + no-store để chắc chắn lấy index.html mới nhất, không dính cache.
    const res = await fetch(`/?v=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return null;
    const sig = extractBundleSig(await res.text());
    return sig || null;
  } catch {
    return null;
  }
}

// Đừng reload khi người dùng đang gõ — tránh mất nội dung đang nhập.
function isTyping(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  return (
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.isContentEditable === true
  );
}

export function startWebAutoUpdate(intervalMs = 60_000, firstCheckDelayMs = 10_000) {
  if (started || Platform.OS !== "web") return;
  if (typeof window === "undefined" || typeof document === "undefined") return;
  started = true;

  const check = async () => {
    if (document.visibilityState === "hidden") return;
    const sig = await fetchSig();
    if (!sig) return;
    if (baseline === null) {
      baseline = sig; // mốc bản đang chạy
      return;
    }
    if (sig !== baseline && !isTyping()) {
      window.location.reload();
    }
  };

  // Lần kiểm đầu lùi lại vài giây — không tranh mạng với các request dữ liệu lúc mở app.
  setTimeout(check, firstCheckDelayMs);
  setInterval(check, intervalMs);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") check();
  });
}
