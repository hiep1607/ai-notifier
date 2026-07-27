// RSS tin tức VN (Pha C) — parser THUẦN (không Deno API) để jest test được.
// Vì sao RSS: link bài LUÔN THẬT (hết link bịa), tiêu đề ổn định (dedup chuẩn),
// và không đụng quota Gemini grounding — chỉ cần 1 call flash-lite để CHỌN + TÓM TẮT.

export interface RssItem {
  title: string;
  link: string;
  description: string;
  pubDate: string; // giữ nguyên chuỗi từ feed (Date.parse được dạng RFC822)
}

// Feed theo category của rule (đã verify sống 2026-07-18). Tối đa 2 feed/category,
// luôn từ 2 tòa soạn khác nhau để một nguồn không độc chiếm ứng viên.
export const CATEGORY_FEEDS: Record<string, string[]> = {
  finance: ["https://vnexpress.net/rss/kinh-doanh.rss", "https://cafef.vn/thi-truong.rss"],
  tech: ["https://vnexpress.net/rss/so-hoa.rss", "https://tuoitre.vn/rss/nhip-song-so.rss"],
  news: ["https://vnexpress.net/rss/thoi-su.rss", "https://thanhnien.vn/rss/thoi-su.rss"],
  sports: ["https://vnexpress.net/rss/the-thao.rss", "https://tuoitre.vn/rss/the-thao.rss"],
  health: ["https://vnexpress.net/rss/suc-khoe.rss", "https://tuoitre.vn/rss/suc-khoe.rss"],
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

// Parse RSS 2.0 + ATOM bằng regex (edge runtime không có DOMParser; đủ dùng).
// Atom (<entry>) cần cho nguồn MXH/dev: Reddit .rss, YouTube feeds/videos.xml,
// GitHub releases.atom đều là Atom chứ không phải RSS 2.0.
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
  if (out.length > 0) return out;

  // ATOM: link nằm ở ATTRIBUTE href (ưu tiên rel="alternate"), không phải text trong tag.
  const entries = xml.match(/<entry(?:\s[^>]*)?>[\s\S]*?<\/entry>/gi) ?? [];
  for (const b of entries) {
    const linkTags = b.match(/<link\b[^>]*>/gi) ?? [];
    const alt = linkTags.find((t) => /rel=["']alternate["']/i.test(t)) ?? linkTags[0];
    const link = decodeEntities(alt?.match(/href=["']([^"']+)["']/i)?.[1] ?? "");
    const item: RssItem = {
      title: pickTag(b, "title"),
      link,
      description: (pickTag(b, "summary") || pickTag(b, "content") || pickTag(b, "media:description"))
        .slice(0, 500),
      pubDate: pickTag(b, "published") || pickTag(b, "updated"),
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

// Gộp item nhiều feed: bỏ trùng link, giữ suất tối thiểu cho từng feed rồi mới sắp
// theo thời gian. Như vậy một báo đăng dồn dập không chiếm cả danh sách ứng viên.
export function mergeRssItems(lists: RssItem[][], limit = 30): RssItem[] {
  const seen = new Set<string>();
  const selected: RssItem[] = [];
  const nonEmpty = lists.filter((list) => list.length > 0);
  const perFeed = Math.max(1, Math.floor(limit / Math.max(1, nonEmpty.length)));
  const ts = (i: RssItem) => {
    const t = Date.parse(i.pubDate);
    return Number.isFinite(t) ? t : 0;
  };
  const sorted = nonEmpty.map((list) => [...list].sort((a, b) => ts(b) - ts(a)));

  for (const list of sorted) {
    let accepted = 0;
    for (const it of list) {
      if (seen.has(it.link)) continue;
      seen.add(it.link);
      selected.push(it);
      accepted++;
      if (accepted >= perFeed) break;
    }
  }

  // Feed ít bài có thể để thừa chỗ; lấp phần còn lại bằng các bài mới nhất toàn bộ nguồn.
  if (selected.length < limit) {
    const rest = sorted.flat().sort((a, b) => ts(b) - ts(a));
    for (const it of rest) {
      if (seen.has(it.link)) continue;
      seen.add(it.link);
      selected.push(it);
      if (selected.length >= limit) break;
    }
  }
  return selected.sort((a, b) => ts(b) - ts(a)).slice(0, limit);
}
