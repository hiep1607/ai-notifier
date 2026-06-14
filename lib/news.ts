// Lấy tin tức THẬT từ RSS trực tiếp của báo Việt (link bài thật, mô tả thật).
// Chọn feed theo category của rule → lọc theo keyword → lấy full nội dung bài qua jina reader.
// Nhờ vậy AI có dữ liệu thật (giá, số liệu) để viết thông báo, không bịa.

// rss2json: parse RSS → JSON, có CORS → chạy web + mobile, free 10k req/ngày.
const RSS2JSON = "https://api.rss2json.com/v1/api.json?rss_url=";
// jina reader: lấy nội dung 1 URL → text sạch cho LLM, có CORS, miễn phí.
const JINA = "https://r.jina.ai/";

// Feed VnExpress theo từng category (rss2json đọc ổn định). "tin-moi-nhat" gộp mọi chủ đề
// để tăng khả năng khớp keyword cho các rule không thuộc category cụ thể.
const LATEST = "https://vnexpress.net/rss/tin-moi-nhat.rss";
const FEEDS_BY_CATEGORY: Record<string, string[]> = {
  finance: ["https://vnexpress.net/rss/kinh-doanh.rss", LATEST],
  tech: ["https://vnexpress.net/rss/so-hoa.rss", LATEST],
  sports: ["https://vnexpress.net/rss/the-thao.rss", LATEST],
  news: ["https://vnexpress.net/rss/thoi-su.rss", LATEST],
  health: ["https://vnexpress.net/rss/suc-khoe.rss", LATEST],
  weather: ["https://vnexpress.net/rss/thoi-su.rss", LATEST],
  other: [LATEST],
};

export interface NewsItem {
  title: string;
  link: string;    // URL bài viết gốc (trực tiếp, fetch được)
  source: string;
  pubDate: string;
  snippet: string; // mô tả ngắn từ RSS
}

function decodeEntities(str: string): string {
  return str
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

function stripHtml(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

// Bỏ dấu tiếng Việt + lowercase để so khớp keyword không phụ thuộc dấu.
function normalize(s: string): string {
  let r = s.toLowerCase();
  try {
    r = r.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d");
  } catch {
    // Engine không hỗ trợ normalize → dùng nguyên bản lowercase.
  }
  return r;
}

// Bài khớp nếu chứa ĐỦ tất cả từ trong keyword (không phụ thuộc dấu).
function matchesKeyword(item: NewsItem, keyword: string): boolean {
  const hay = normalize(item.title + " " + item.snippet);
  const words = normalize(keyword).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  return words.every((w) => hay.includes(w));
}

// fetch có timeout — tránh treo cả vòng quét nếu 1 request chậm.
async function fetchWithTimeout(
  url: string,
  ms: number,
  headers?: Record<string, string>
): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { signal: ctrl.signal, headers });
  } finally {
    clearTimeout(t);
  }
}

async function fetchFeed(feedUrl: string): Promise<NewsItem[]> {
  try {
    const res = await fetchWithTimeout(RSS2JSON + encodeURIComponent(feedUrl), 15000);
    if (!res.ok) return [];
    const json = await res.json();
    if (json.status !== "ok" || !Array.isArray(json.items)) return [];
    return json.items.map((it: any): NewsItem => ({
      title: stripHtml(String(it.title ?? "")),
      link: String(it.link ?? ""),
      source: "VnExpress",
      pubDate: String(it.pubDate ?? ""),
      snippet: stripHtml(String(it.description ?? it.content ?? "")).slice(0, 300),
    }));
  } catch {
    return [];
  }
}

// Lấy các bài THẬT khớp keyword cho 1 rule.
export async function fetchNews(
  keyword: string,
  category = "other",
  limit = 10
): Promise<NewsItem[]> {
  const feeds = FEEDS_BY_CATEGORY[category] ?? FEEDS_BY_CATEGORY.other;

  // Lấy song song các feed của category.
  const results = await Promise.all(feeds.map(fetchFeed));
  const all = results.flat();

  // Dedup theo link, lọc theo keyword.
  const seen = new Set<string>();
  const matched: NewsItem[] = [];
  for (const it of all) {
    if (!it.link || seen.has(it.link)) continue;
    seen.add(it.link);
    if (matchesKeyword(it, keyword)) matched.push(it);
  }

  return matched.slice(0, limit);
}

// Lấy nội dung bài qua jina reader. Lỗi/timeout → trả "" (dùng snippet thay thế).
// X-Target-Selector: chỉ lấy đúng khối nội dung bài VnExpress (.fck_detail),
// bỏ menu/quảng cáo/sidebar → ngắn gọn, đúng số liệu, đỡ tốn context cho model nhỏ.
export async function fetchArticleBody(url: string): Promise<string> {
  try {
    const res = await fetchWithTimeout(JINA + url, 20000, {
      "X-Target-Selector": ".fck_detail",
    });
    if (!res.ok) return "";
    const md = await res.text();
    // Bỏ ảnh/link markdown, gộp khoảng trắng, cắt gọn cho vừa context model nhỏ.
    const clean = md
      .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")     // ảnh
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")   // link giữ lại text
      .replace(/\s+/g, " ")
      .trim();
    return clean.slice(0, 3000);
  } catch {
    return "";
  }
}
