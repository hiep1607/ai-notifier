// RSS tin tức VN (Pha C) — parser THUẦN (không Deno API) để jest test được.
// Vì sao RSS: link bài LUÔN THẬT (hết link bịa), tiêu đề ổn định (dedup chuẩn),
// và không đụng quota Gemini grounding — chỉ cần 1 call flash-lite để CHỌN + TÓM TẮT.

export interface RssItem {
  title: string;
  link: string;
  description: string;
  pubDate: string; // giữ nguyên chuỗi từ feed (Date.parse được dạng RFC822)
}

// Feed theo category của rule (đã verify sống 2026-07-02). Tối đa 2 feed/category
// để 1 lần quét không fetch quá nhiều. Feed đầu ưu tiên đúng chuyên mục.
export const CATEGORY_FEEDS: Record<string, string[]> = {
  finance: ["https://vnexpress.net/rss/kinh-doanh.rss", "https://cafef.vn/thi-truong.rss"],
  tech: ["https://vnexpress.net/rss/so-hoa.rss", "https://vnexpress.net/rss/khoa-hoc.rss"],
  news: ["https://vnexpress.net/rss/thoi-su.rss", "https://vnexpress.net/rss/tin-moi-nhat.rss"],
  sports: ["https://vnexpress.net/rss/the-thao.rss", "https://tuoitre.vn/rss/tin-moi-nhat.rss"],
  health: ["https://vnexpress.net/rss/suc-khoe.rss"],
  weather: [], // thời tiết đã có provider Open-Meteo; RSS không có feed riêng
  other: ["https://vnexpress.net/rss/tin-moi-nhat.rss", "https://tuoitre.vn/rss/tin-moi-nhat.rss"],
};

export function feedsForCategory(category?: string | null): string[] {
  return CATEGORY_FEEDS[category ?? "other"] ?? CATEGORY_FEEDS.other;
}

const ENTITIES: Record<string, string> = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'", "&nbsp;": " ",
};

export function decodeEntities(s: string): string {
  return s
    .replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (m) => ENTITIES[m] ?? m)
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

// Lấy nội dung 1 tag trong block item: bóc CDATA, bỏ thẻ HTML (description hay kèm <a><img>).
function pickTag(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  let v = m?.[1] ?? "";
  v = v.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  v = v.replace(/<[^>]+>/g, " ");
  return decodeEntities(v).replace(/\s+/g, " ").trim();
}

// Parse RSS 2.0 bằng regex (edge runtime không có DOMParser; format feed VN đơn giản, đủ dùng).
export function parseRss(xml: string, limit = 30): RssItem[] {
  const out: RssItem[] = [];
  const blocks = xml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi) ?? [];
  for (const b of blocks) {
    const item: RssItem = {
      title: pickTag(b, "title"),
      link: pickTag(b, "link"),
      description: pickTag(b, "description").slice(0, 500),
      pubDate: pickTag(b, "pubDate"),
    };
    if (item.title && item.link) out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}

// Tên báo từ link bài (để hiện "source" đẹp thay vì domain thô).
const HOST_NAMES: Record<string, string> = {
  "vnexpress.net": "VnExpress",
  "tuoitre.vn": "Tuổi Trẻ",
  "thanhnien.vn": "Thanh Niên",
  "cafef.vn": "CafeF",
  "dantri.com.vn": "Dân Trí",
  "vietnamnet.vn": "VietnamNet",
};

export function sourceFromLink(link: string): string {
  try {
    const host = new URL(link).hostname.replace(/^www\./, "");
    return HOST_NAMES[host] ?? host;
  } catch {
    return "Web";
  }
}

// Gộp item nhiều feed: bỏ trùng link, mới nhất trước, cắt còn `limit`.
export function mergeRssItems(lists: RssItem[][], limit = 30): RssItem[] {
  const seen = new Set<string>();
  const all: RssItem[] = [];
  for (const list of lists) {
    for (const it of list) {
      if (seen.has(it.link)) continue;
      seen.add(it.link);
      all.push(it);
    }
  }
  const ts = (i: RssItem) => {
    const t = Date.parse(i.pubDate);
    return Number.isFinite(t) ? t : 0;
  };
  return all.sort((a, b) => ts(b) - ts(a)).slice(0, limit);
}
