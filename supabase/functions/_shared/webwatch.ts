// Fetch TRANG WEB CỤ THỂ cho rule source_type='url' (Pha E).
// Phần thuần (isWatchableUrl / parseWatchAuth / stripHtml) nằm ở monitorLogic.ts để jest
// test được; file này chỉ giữ phần chạm mạng (Deno fetch).

import { isWatchableUrl, parseWatchAuth, stripHtml } from "./monitorLogic.ts";

export interface WatchPage {
  status: number;   // HTTP status (401/403 = nhiều khả năng cần đăng nhập)
  text: string;     // nội dung trang đã strip HTML, cắt trần cho vừa prompt AI
  html: string;     // HTML THÔ (đã cap dung lượng) — để dò feed khai báo + trích link bài
  finalUrl: string; // URL sau redirect (trang login hay redirect về /login)
}

const MAX_BYTES = 400_000; // đọc tối đa ~400KB HTML — đủ cho mọi trang nội dung

// Fetch trang + strip HTML. authRaw = watch_auth người dùng dán (cookie / headers).
// THROW khi URL không hợp lệ/nội bộ hoặc lỗi mạng — caller quyết định fallback.
export async function fetchWatchPage(url: string, authRaw?: string | null): Promise<WatchPage> {
  if (!isWatchableUrl(url)) throw new Error("URL không hợp lệ hoặc trỏ vào mạng nội bộ");

  const headers: Record<string, string> = {
    // UA trình duyệt thật — nhiều trang trả trang trắng/chặn khi thấy UA lạ.
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
    "Accept-Language": "vi,en;q=0.8",
    ...parseWatchAuth(authRaw),
  };

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  let res: Response;
  try {
    res = await fetch(url, { headers, redirect: "follow", signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }

  // Đọc body theo stream để cắt trần dung lượng (trang nặng không kéo sập function).
  let raw = "";
  const reader = res.body?.getReader();
  if (reader) {
    const decoder = new TextDecoder();
    let bytes = 0;
    while (bytes < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      raw += decoder.decode(value, { stream: true });
    }
    try { await reader.cancel(); } catch { /* đã đọc đủ */ }
  } else {
    raw = await res.text();
  }

  return { status: res.status, text: stripHtml(raw), html: raw, finalUrl: res.url || url };
}
