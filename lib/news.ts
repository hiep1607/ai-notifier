// Lấy tin tức THẬT từ Google News RSS theo từ khóa.
// Google News tự đi tìm bài từ các nguồn uy tín → trả về link bài thật.
// AI (Ollama) chỉ đọc các bài này rồi tóm tắt — không tự bịa.

import { Platform } from "react-native";

export interface NewsItem {
  title: string;
  link: string;       // URL bài viết gốc (thật)
  source: string;     // Tên nguồn (VnExpress, Tuổi Trẻ...)
  pubDate: string;    // Ngày đăng (ISO hoặc raw)
  snippet: string;    // Mô tả ngắn từ RSS
}

// Trên web, fetch thẳng news.google.com bị CORS chặn → đi qua proxy.
// Trên mobile (Expo Go) không có CORS → fetch trực tiếp.
// Đổi CORS_PROXY sang Edge Function riêng sau này nếu cần (chỉ sửa 1 dòng).
const CORS_PROXY = "https://api.allorigins.win/raw?url=";

function buildGoogleNewsUrl(keyword: string): string {
  const q = encodeURIComponent(keyword);
  return `https://news.google.com/rss/search?q=${q}&hl=vi&gl=VN&ceid=VN:vi`;
}

// Giải mã các entity HTML cơ bản mà RSS hay encode.
function decodeEntities(str: string): string {
  return str
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

// Lấy nội dung text bên trong 1 thẻ XML (hỗ trợ cả CDATA).
function extractTag(block: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = block.match(re);
  if (!m) return "";
  let val = m[1].trim();
  // Bóc CDATA nếu có
  val = val.replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "").trim();
  return decodeEntities(val);
}

// Google News bọc tiêu đề thật + tên nguồn trong description (HTML). Bỏ tag để lấy text.
function stripHtml(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

// Parse RSS XML thành mảng NewsItem — dùng regex để chạy cả web lẫn React Native
// (RN không có DOMParser). RSS đơn giản nên regex là đủ và ổn định.
function parseRss(xml: string): NewsItem[] {
  const items: NewsItem[] = [];
  const itemBlocks = xml.match(/<item>([\s\S]*?)<\/item>/g) ?? [];

  for (const block of itemBlocks) {
    const title = extractTag(block, "title");
    const link = extractTag(block, "link");
    const pubDate = extractTag(block, "pubDate");
    const source = extractTag(block, "source");
    const rawDesc = extractTag(block, "description");

    if (!title || !link) continue;

    items.push({
      title,
      link,
      source: source || "Google News",
      pubDate,
      snippet: stripHtml(rawDesc).slice(0, 300),
    });
  }

  return items;
}

// Lấy tối đa `limit` bài mới nhất cho keyword.
export async function fetchNews(keyword: string, limit = 10): Promise<NewsItem[]> {
  const target = buildGoogleNewsUrl(keyword);
  const url = Platform.OS === "web" ? CORS_PROXY + encodeURIComponent(target) : target;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Không lấy được tin (HTTP ${res.status})`);
  }

  const xml = await res.text();
  return parseRss(xml).slice(0, limit);
}
