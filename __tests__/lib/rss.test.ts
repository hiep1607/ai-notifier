// Test parser RSS thuần (supabase/functions/_shared/rss.ts) — cùng code chạy trên server.
import {
  parseRss,
  mergeRssItems,
  decodeEntities,
  feedsForCategory,
  sourceFromLink,
  CATEGORY_FEEDS,
} from "../../supabase/functions/_shared/rss";

// Mẫu rút gọn theo đúng format VnExpress (CDATA + <a><img> trong description).
const SAMPLE = `<?xml version="1.0"?><rss><channel>
<item>
  <title>Kinh tế TP HCM tăng trưởng 8,55% nửa đầu năm</title>
  <description><![CDATA[<a href="https://vnexpress.net/x.html"><img src="https://img.jpg"></a></br>GRDP của TP HCM 6 tháng đầu năm tăng 8,55%, nhờ tiêu dùng tích cực.]]></description>
  <pubDate>Thu, 02 Jul 2026 19:44:58 +0700</pubDate>
  <link>https://vnexpress.net/kinh-te-tp-hcm.html</link>
</item>
<item>
  <title>Gi&#225; v&#224;ng h&#244;m nay &amp; ng&#224;y mai</title>
  <description>Tin ngắn không CDATA</description>
  <pubDate>Thu, 02 Jul 2026 18:00:00 +0700</pubDate>
  <link>https://cafef.vn/gia-vang.chn</link>
</item>
<item>
  <title></title>
  <link>https://bo-vi-thieu-title.vn</link>
</item>
</channel></rss>`;

describe("parseRss", () => {
  it("bóc CDATA, bỏ thẻ HTML trong description, giữ link + pubDate", () => {
    const items = parseRss(SAMPLE);
    expect(items).toHaveLength(2); // item thiếu title bị loại
    expect(items[0].title).toBe("Kinh tế TP HCM tăng trưởng 8,55% nửa đầu năm");
    expect(items[0].description).toContain("GRDP của TP HCM");
    expect(items[0].description).not.toContain("<img");
    expect(items[0].link).toBe("https://vnexpress.net/kinh-te-tp-hcm.html");
    expect(Date.parse(items[0].pubDate)).toBeGreaterThan(0);
  });

  it("giải mã entity số (&#225;) và tên (&amp;)", () => {
    const items = parseRss(SAMPLE);
    expect(items[1].title).toBe("Giá vàng hôm nay & ngày mai");
  });

  it("xml rác / rỗng → mảng rỗng, không throw", () => {
    expect(parseRss("")).toEqual([]);
    expect(parseRss("<html>not rss</html>")).toEqual([]);
  });
});

describe("mergeRssItems", () => {
  it("bỏ trùng link giữa các feed, sắp mới nhất trước", () => {
    const a = parseRss(SAMPLE);
    const dup = [{ ...a[0] }, { title: "Bài khác", link: "https://x.vn/1", description: "", pubDate: "Thu, 02 Jul 2026 20:00:00 +0700" }];
    const merged = mergeRssItems([a, dup]);
    expect(merged.filter((i) => i.link === a[0].link)).toHaveLength(1); // hết trùng
    expect(merged[0].title).toBe("Bài khác"); // 20:00 mới nhất lên đầu
  });
});

describe("feedsForCategory & sourceFromLink", () => {
  it("category lạ / null → feed 'other'; weather rỗng (đã có provider)", () => {
    expect(feedsForCategory("finance")).toEqual(CATEGORY_FEEDS.finance);
    expect(feedsForCategory(null)).toEqual(CATEGORY_FEEDS.other);
    expect(feedsForCategory("khong-ton-tai")).toEqual(CATEGORY_FEEDS.other);
    expect(feedsForCategory("weather")).toEqual([]);
  });

  it("map hostname → tên báo; link hỏng → 'Web'", () => {
    expect(sourceFromLink("https://vnexpress.net/abc.html")).toBe("VnExpress");
    expect(sourceFromLink("https://www.tuoitre.vn/x")).toBe("Tuổi Trẻ");
    expect(sourceFromLink("https://laodong.vn/x")).toBe("laodong.vn");
    expect(sourceFromLink("not a url")).toBe("Web");
  });
});

describe("decodeEntities", () => {
  it("giải mã entity phổ biến", () => {
    expect(decodeEntities("A &amp; B &lt;tag&gt; &quot;q&quot; &#39;s&#39;")).toBe(`A & B <tag> "q" 's'`);
  });
});
