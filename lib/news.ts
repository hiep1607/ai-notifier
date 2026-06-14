// Lấy tin tức THẬT từ Google News theo từ khóa, qua rss2json.
// rss2json trả JSON đã parse sẵn + có CORS → chạy giống nhau trên web lẫn mobile,
// không cần proxy riêng, không cần parse XML thủ công.
// Google News tự đi tìm bài từ các nguồn uy tín → link bài là thật.
// AI (Ollama) chỉ đọc các bài này rồi tóm tắt — không tự bịa.

export interface NewsItem {
  title: string;
  link: string;       // URL bài viết gốc (thật, qua redirect Google News)
  source: string;     // Tên nguồn (VnExpress, Tuổi Trẻ...)
  pubDate: string;    // Ngày đăng
  snippet: string;    // Mô tả ngắn từ RSS
}

// rss2json: free 10.000 request/ngày cho feed công khai, không cần API key.
// Nếu sau này cần nhiều hơn, đăng ký key miễn phí và thêm &api_key=...
const RSS2JSON = "https://api.rss2json.com/v1/api.json?rss_url=";

function buildGoogleNewsUrl(keyword: string): string {
  const q = encodeURIComponent(keyword);
  return `https://news.google.com/rss/search?q=${q}&hl=vi&gl=VN&ceid=VN:vi`;
}

function decodeEntities(str: string): string {
  return str
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function stripHtml(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

// Google News nhét tên nguồn vào cuối tiêu đề: "Tiêu đề bài - VnExpress".
// Tách ra để có tiêu đề sạch + tên nguồn.
function splitTitleSource(raw: string): { title: string; source: string } {
  const idx = raw.lastIndexOf(" - ");
  if (idx > 0 && raw.length - idx < 45) {
    return { title: raw.slice(0, idx).trim(), source: raw.slice(idx + 3).trim() };
  }
  return { title: raw.trim(), source: "Google News" };
}

// Lấy tối đa `limit` bài mới nhất cho keyword.
export async function fetchNews(keyword: string, limit = 10): Promise<NewsItem[]> {
  const target = buildGoogleNewsUrl(keyword);
  const res = await fetch(RSS2JSON + encodeURIComponent(target));

  if (!res.ok) {
    throw new Error(`Không lấy được tin (HTTP ${res.status})`);
  }

  const json = await res.json();
  if (json.status !== "ok" || !Array.isArray(json.items)) {
    throw new Error("Nguồn tin trả về dữ liệu không hợp lệ");
  }

  return json.items
    .slice(0, limit)
    .map((it: any): NewsItem => {
      const { title, source } = splitTitleSource(String(it.title ?? ""));
      return {
        title,
        link: String(it.link ?? ""),
        source,
        pubDate: String(it.pubDate ?? ""),
        snippet: stripHtml(String(it.description ?? it.content ?? "")).slice(0, 300),
      };
    })
    .filter((it: NewsItem) => it.title && it.link);
}
