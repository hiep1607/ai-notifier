// Fetch tài nguyên web cho run-monitor. Mọi URL người dùng hoặc redirect đều được
// kiểm tra protocol, IP literal và DNS trước khi request để giảm bề mặt SSRF.

import { isPrivateHost, isWatchableUrl, parseWatchAuth, stripHtml } from "./monitorLogic.ts";

export interface WatchPage {
  status: number;
  text: string;
  html: string;
  finalUrl: string;
}

export interface PublicResource {
  status: number;
  body: string;
  finalUrl: string;
  contentType: string;
}

interface FetchPublicOptions {
  headers?: Record<string, string>;
  authRaw?: string | null;
  maxBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
}

const MAX_PAGE_BYTES = 400_000;
const DEFAULT_MAX_BYTES = 1_000_000;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function isIpLiteral(hostname: string): boolean {
  const h = hostname.replace(/^\[|\]$/g, "");
  return h.includes(":") || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(h);
}

async function assertPublicDestination(rawUrl: string): Promise<URL> {
  if (!isWatchableUrl(rawUrl)) {
    throw new Error("URL không hợp lệ hoặc trỏ vào mạng nội bộ");
  }

  const url = new URL(rawUrl);
  if (isIpLiteral(url.hostname)) return url; // isWatchableUrl đã kiểm tra IP literal.

  // Chống hostname công khai nhưng DNS trả về loopback/private/metadata. Fail closed
  // nếu không phân giải được; fetch không được tự thử một đích chưa kiểm chứng.
  const answers: string[] = [];
  const queries = await Promise.allSettled([
    Deno.resolveDns(url.hostname, "A"),
    Deno.resolveDns(url.hostname, "AAAA"),
  ]);
  for (const query of queries) {
    if (query.status === "fulfilled") answers.push(...query.value);
  }
  if (answers.length === 0) throw new Error(`Không phân giải được DNS cho ${url.hostname}`);
  if (answers.some(isPrivateHost)) {
    throw new Error(`DNS của ${url.hostname} trỏ vào mạng nội bộ`);
  }
  return url;
}

async function readBodyCapped(res: Response, maxBytes: number): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return (await res.text()).slice(0, maxBytes);

  const decoder = new TextDecoder();
  let raw = "";
  let bytes = 0;
  try {
    while (bytes < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      const remaining = maxBytes - bytes;
      const chunk = value.byteLength > remaining ? value.subarray(0, remaining) : value;
      bytes += chunk.byteLength;
      raw += decoder.decode(chunk, { stream: bytes < maxBytes });
    }
    raw += decoder.decode();
  } finally {
    try { await reader.cancel(); } catch { /* body đã đóng */ }
  }
  return raw;
}

// Fetch có redirect thủ công: xác minh DNS ở từng hop và không bao giờ chuyển Cookie/
// Authorization do người dùng cung cấp sang origin khác.
export async function fetchPublicResource(rawUrl: string, options: FetchPublicOptions = {}): Promise<PublicResource> {
  const authHeaders = parseWatchAuth(options.authRaw);
  const hasAuth = Object.keys(authHeaders).length > 0;
  const headers: Record<string, string> = { ...(options.headers ?? {}), ...authHeaders };
  const maxBytes = Math.max(1, Math.min(options.maxBytes ?? DEFAULT_MAX_BYTES, 2_000_000));
  const maxRedirects = Math.max(0, Math.min(options.maxRedirects ?? 5, 10));
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), options.timeoutMs ?? 15_000);

  let current = rawUrl;
  try {
    for (let redirects = 0; redirects <= maxRedirects; redirects++) {
      const currentUrl = await assertPublicDestination(current);
      const res = await fetch(currentUrl, { headers, redirect: "manual", signal: ctrl.signal });

      if (!REDIRECT_STATUSES.has(res.status)) {
        return {
          status: res.status,
          body: await readBodyCapped(res, maxBytes),
          finalUrl: currentUrl.toString(),
          contentType: res.headers.get("content-type") ?? "",
        };
      }

      const location = res.headers.get("location");
      try { await res.body?.cancel(); } catch { /* redirect không cần body */ }
      if (!location) throw new Error(`Redirect HTTP ${res.status} thiếu Location`);
      if (redirects === maxRedirects) throw new Error("Trang chuyển hướng quá nhiều lần");

      const next = new URL(location, currentUrl);
      if (hasAuth && next.origin !== currentUrl.origin) {
        throw new Error("Từ chối chuyển thông tin đăng nhập sang tên miền khác");
      }
      current = next.toString();
    }
  } finally {
    clearTimeout(timer);
  }
  throw new Error("Trang chuyển hướng quá nhiều lần");
}

// Fetch trang + strip HTML. authRaw = watch_auth người dùng dán (cookie / headers).
export async function fetchWatchPage(url: string, authRaw?: string | null): Promise<WatchPage> {
  const resource = await fetchPublicResource(url, {
    authRaw,
    maxBytes: MAX_PAGE_BYTES,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
      "Accept-Language": "vi,en;q=0.8",
    },
  });
  return {
    status: resource.status,
    text: stripHtml(resource.body),
    html: resource.body,
    finalUrl: resource.finalUrl,
  };
}
