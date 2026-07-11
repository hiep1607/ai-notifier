# CÔNG NGHỆ & HÀNH TRÌNH THIẾT KẾ — AI Notifier (Nofy)

> File này ghi lại **mọi công nghệ đã dùng theo hướng tiến hóa**: từng vấn đề đã **thử giải pháp nào → vì sao bỏ → vì sao chốt giải pháp hiện tại**. Mọi chuyện kể ở đây đều là chuyện THẬT đã xảy ra trong dự án (đối chiếu nhật ký [KE_HOACH.md](KE_HOACH.md) và kết quả kiểm thử [KICH_BAN_TEST.md](KICH_BAN_TEST.md)).
> Cách dùng từng tính năng: [TINH_NANG.md](TINH_NANG.md).

**Stack chốt hiện tại:** React Native 0.81 + Expo SDK 54 (Expo Router 6) · Supabase (Postgres + RLS + Auth + Edge Functions Deno + pg_cron/pg_net) · Google Gemini server-side (grounding + fallback đa model) · Expo Push · EAS Update (OTA) + EAS Hosting (web) · TypeScript + Jest (140 test).

---

## 1. TẦNG AI — từ Ollama local đến Gemini đa bucket

### 1a. Chạy model ở đâu?
- **Đã thử: Ollama chạy local trên máy dev.** Bỏ vì 3 lý do chí mạng: (1) muốn quét nền 24/7 thì máy phải bật 24/7; (2) app không public ra người khác dùng được (AI nằm trên máy cá nhân); (3) model local nhỏ, chất lượng trích JSON/tiếng Việt kém.
- **Hiện tại: Gemini gọi từ Supabase Edge Functions (server-side).** Key nằm trong Supabase secret — app KHÔNG bao giờ cầm key AI. Được cả 3 thứ Ollama thiếu: chạy nền độc lập, public được, chất lượng cao. Đây là bước ngoặt kiến trúc lớn nhất của dự án (2026-06-19, "bỏ Ollama").

### 1b. Chọn model nào cho việc gì?
- **Đã thử: một model `gemini-2.5-flash` cho tất cả.** Chạy được nhưng phí: tạo rule chỉ là trích JSON từ hội thoại, không cần grounding, không cần model to.
- **Đã thử (2026-06-20): tách model theo task** — generate-rule hạ xuống `flash-lite` (rẻ ~33%). Ổn cho tới khi...
- **Sự cố 2026-07: Google siết free tier `2.5-flash-lite` còn ~20 lượt/NGÀY**, và phát hiện quota tính **RIÊNG TỪNG MODEL** (mỗi model một "xô" riêng). App lúc đó dồn mọi việc vào flash-lite → cạn xô là chết cả hệ, dù các xô khác còn nguyên. Chẩn đoán ban đầu "cron đốt cả nghìn call" hóa ra SAI — app chỉ dùng ~100 call/ngày; vấn đề là trần bị hạ.
- **Hiện tại: fallback đa bucket** (`_shared/gemini.ts`, tham số `fallbackModels`): gặp 429 hết-quota-ngày hoặc model 404 thì tự thử model kế trong chuỗi. Quét nền/chép lời đi chuỗi rẻ (`2.5-flash-lite → 2.0-flash-lite → 2.0-flash → 2.5-flash`); tạo rule đi `2.5-flash` TRƯỚC (việc hướng người dùng, phải mượt). Mỗi call ghi vào `usage_logs` kèm model thật đã dùng → màn Admin đếm đúng theo từng xô, bỏ con số "/1500" bịa. Kiểm chứng thật: tạo rule trả `ready` ngay lúc flash-lite đang cạn.

### 1c. Trả phí cho xong?
- **Đã thử (2026-06-20): bật Gemini Tier 1 trả phí** để hết lo quota — **thất bại vì thẻ Visa ảo (MB) bị Google từ chối**. 
- **Hiện tại: ở lại free tier nhưng thiết kế cả hệ thống quanh ràng buộc quota** (xem toàn bộ mục 3). Trớ trêu mà hay: chính vì không trả phí được mà app có router nguồn rẻ-trước, hash-gate, RSS... — giờ có trả phí thì chi phí cũng thấp hơn nhiều lần so với thiết kế ban đầu.

### 1d. Phân biệt 2 loại 429 (chuyện tưởng nhỏ mà mất nhiều ngày)
- **Vấn đề:** admin thấy "quota quá tải" khi mới dùng 20/1500 lượt; retry chờ 60s × 6 lần vẫn kẹt.
- **Đã thử: tin vào chuỗi "retry in Ns"** trong lỗi → chờ đúng N giây → vẫn kẹt. Hóa ra Gemini kèm "retry in ~60s" **cả khi hết quota NGÀY** (chờ kiểu gì cũng vô ích).
- **Hiện tại:** đọc `quotaId` trong body lỗi để phân loại **PerMinute** (nghẽn tức thời — chờ đúng N giây rồi thử lại) vs **PerDay** (hết hôm nay — nói thẳng với người dùng "hết lượt, reset ~14h giờ VN", dừng cả loạt). Heuristic retry-giây chỉ còn là lưới phụ.

---

## 2. TÌM TIN & LINK BÀI GỐC — cuộc chiến chống "AI bịa"

### 2a. Link bài gốc lấy từ đâu?
- **Đã thử: để AI tự ghi `source_url`** trong JSON trả về → **AI bịa URL** hoặc ghi link chết. Người dùng bấm "Đọc bài gốc" ra 404.
- **Đã thử: lấy URL từ grounding metadata của Google Search** (link THẬT Google trả) → link hết bịa, NHƯNG URL grounding **đổi mỗi lần gọi** (redirect qua domain trung gian) → chống-trùng theo URL vỡ trận.
- **Hiện tại: kết hợp theo nguồn.** Đường RSS/feed: link bài lấy thẳng từ feed — luôn thật, ổn định. Đường grounding: vẫn lấy URL thật từ metadata nhưng **chống trùng chuyển sang so TIÊU ĐỀ chuẩn hóa** (vì URL không ổn định). Đường đọc trang: AI phải CHỌN link từ danh sách anchor bóc sẵn từ HTML (`extractPageLinks`) thay vì tự viết URL.

### 2b. Nội dung thông báo
- **Đã thử: tóm tắt từ mô tả feed** → user chê "thông báo sơ sài" (mô tả feed chỉ 1-2 câu, mục Phân tích trống trơn).
- **Hiện tại: `enrichFromArticle`** — chọn bài xong thì fetch **bài gốc**, để flash-lite viết bản tin đầy đủ (content 4-6 câu + details phân tích + ai_summary) từ TEXT THẬT của bài. Best-effort: bài chặn bot/AI lỗi → giữ bản tóm tắt ngắn như cũ, không được làm hỏng thông báo. Prompt toàn hệ có 2 quy tắc cứng: số liệu đổi phải ghi "từ [cũ] → [mới]" (không nói chênh chung chung); đơn vị ưu tiên kiểu Việt Nam, số ngoại tệ kèm quy đổi trong ngoặc.
- **Trang danh sách (trending, top...):** đã thử để AI tóm chung chung → user chê "chỉ liệt kê tên, không biết dự án để làm gì" → siết quy tắc prompt: mỗi mục BẮT BUỘC 1 câu tiếng Việt giải thích nó là gì/dùng làm gì, dịch từ mô tả trên trang, trang không ghi thì chú "(trang không mô tả)" — cấm bịa.

### 2c. Router nguồn dữ liệu — vì sao không phải cái gì cũng hỏi Gemini
- **Đã thử: mọi rule đều đi Gemini + Google Search grounding.** Chết vì 2 thứ: quota grounding free bị siết (cron toàn "quét 0 ⚠️"), và số liệu (thời tiết/giá) AI trả không đảm bảo chính xác.
- **Hiện tại: chọn đường RẺ nhất trước, grounding là phương án CUỐI**, phân loại bằng heuristic từ keyword ngay lúc quét (rule cũ tự hưởng, không cần migration):
  1. **Nhắc hẹn** → 0 AI, chỉ lịch + push.
  2. **Thời tiết** → Open-Meteo · **Giá coin** → CoinGecko · **Tỷ giá** → open.er-api.com — API thật, free, không cần key, 0 quota. Bản tin dựng bằng template thuần (test được bằng jest). Rule có điều kiện tự do ("khi giá vượt X") → flash-lite chấm ĐÚNG/SAI trên **số thật từ API** (không grounding).
  3. **URL cụ thể** → fetch trang (xem mục 5).
  4. **Tin tức** → RSS báo VN (VnExpress, Tuổi Trẻ, CafeF...) + flash-lite CHỌN bài liên quan — không grounding.
  5. **Còn lại** → Gemini + grounding.
  Provider lỗi → tự rơi xuống đường search, không chết im.

---

## 3. LỊCH QUÉT & QUOTA — nhiều vòng thử-sai nhất dự án

### 3a. Ai là người bấm giờ quét?
- **Đã thử: app quét khi mở** (mỗi lần user vào Home là gọi AI). Bỏ: 2 nơi cùng quét (app + cron) = thông báo TRÙNG + đốt quota gấp đôi.
- **Hiện tại: cron là bộ lập lịch DUY NHẤT.** App mở lên chỉ ĐỌC tin đã có; kéo-refresh mới quét tay và có throttle 5 phút chống bấm dồn. pg_cron + pg_net gọi thẳng Edge Function — không cần server nào bật.

### 3b. Mỗi lượt cron quét bao nhiêu rule?
- **Đã thử: quét hết mọi rule mỗi 15 phút.** Đốt quota vô tội vạ — rule "hằng ngày" cũng bị quét 96 lần/ngày.
- **Đã thử: lịch per-rule (`last_run_at` + tần suất, hàm `isDue`) + trần cứng `MAX_RULES_PER_RUN=8`**, rồi hạ xuống **4** khi quota bị siết (2026-06-20). Vấn đề lộ dần: trần cứng làm rule **bị bỏ đói oan** — đến hạn rồi vẫn phải chờ vì lượt này "đủ 4 đứa rồi".
- **Hiện tại (2026-06-30): bỏ trần cứng.** Pre-filter `isDue` rồi quét hết danh sách tới hạn; `isDue` chính là quota gate tự nhiên (rule 1 tiếng tối đa 24 call/ngày); **deadline 70 giây/lượt** làm lưới an toàn (quá thì dừng, trả phần đã làm, lượt sau quét tiếp — tránh nền tảng kill tiến trình).

### 3c. Nhiều rule cùng tới hạn — quét đứa nào trước?
- **Đã thử: sắp ở SQL theo `last_run_at` tăng dần** ("lâu chưa quét thì quét trước"). Sai bản chất: bỏ qua chu kỳ riêng từng rule — rule 30 phút trễ 10 phút bị xếp sau rule hằng tuần "lâu chưa quét".
- **Đã thử: sắp theo `dueAt = last_run_at + chu kỳ`** ("giờ đáng lẽ phải báo"). Đúng hơn, nhưng lộ bug tinh vi (2026-07-04, vụ "thời tiết 8h báo lúc 10h"): rule ghim giờ hôm trước bắn muộn (sự cố nền) → `last+24h` đẩy nó xuống CUỐI hàng đợi đúng 8h sáng hôm sau, xếp sau cả đống rule tồn đọng.
- **Hiện tại: 2 tầng.** `scanTier` trước (0 = nhắc hẹn — nhạy giờ nhất, 0 AI; 1 = rule GHIM GIỜ — lịch user chủ động đặt; 2 = định kỳ trơn — trễ vài lượt không ai để ý), trong cùng tầng mới so `dueAt`; riêng rule ghim giờ đang trong khung bắn thì `dueAt` = MỐC HẸN hôm nay chứ không phải last+chu kỳ. Kèm bài học code nhỏ: không dùng `.filter(isDue)` trực tiếp vì `isDue(rule, nowMs?)` sẽ nhận INDEX mảng làm `nowMs` (bug kinh điển kiểu `parseInt` trong map).

### 3d. Rule ghim giờ (`run_at`) — từ "lệch 15 phút" đến "đúng phút"
- **V1: khung bắn [giờ hẹn, giờ hẹn+15').** Khớp nhịp cron 15' — nhưng lượt cron đúng giờ mà dính 429 quota (sáng quota hay cạn) hoặc bị deadline 70s cắt là `diff ≥ 15` → **MẤT NGUYÊN NGÀY**. Đây chính là bug "rule 8h mấy hôm liền không báo" (2026-07-02).
- **Đã thử thêm: quét SỚM [target-15, target+15)** để "bắn sát giờ kể cả cron lỡ nhịp" — về sau bỏ hướng bắn sớm (gửi trước giờ hẹn là sai với lịch hẹn; nhắc hẹn từng bắn TRƯỚC giờ vì logic kiểu này).
- **V2 (2026-07-02): catch-up 4 tiếng.** Khung [mốc, mốc+4h) — lỡ lượt nào thử lại lượt cron sau tới khi quét THÀNH CÔNG ("bắn muộn còn hơn nuốt"); chống bắn lặp bằng so `last_run_at` với MỐC HẸN gần nhất; guard chu kỳ trừ hao 5h để hôm-qua-bắn-muộn không làm trượt mốc đúng giờ hôm nay. Đồng thời chốt triết lý: **rule đặt giờ là LỊCH HẸN, không phải bộ lọc** — chế độ "chỉ tin quan trọng" không áp, không có tin mới vẫn giao bản tin fallback đúng hẹn.
- **V3 (2026-07-04): tick mỗi phút.** Cron phụ `reminder-tick` (vốn cho nhắc hẹn) mở rộng thành tick chung: câu SQL cực rẻ chạy mỗi phút, CÓ rule vừa tới mốc mới gọi HTTP → bản tin 8:00 nổ 8:00±1' thay vì lệch theo nhịp 15'. Tick chạy CHỒNG cron chính → chống bắn đúp bằng **CLAIM nguyên tử** (UPDATE có điều kiện trên `last_run_at` — Postgres đảm bảo chỉ 1 lượt nhận được row); lỗi quota SAU khi claim → trả lại `last_run_at` cũ để khung catch-up còn cứu được hôm đó.
- **Ghi chú vận hành:** 8h sáng VN là lúc quota cạn nhất (quota reset 0h Pacific = **14h VN**, cron nền đốt từ chiều hôm trước) → rule sáng cần AI thi thoảng vẫn về muộn trong khung catch-up (đã chứng kiến 10:30). Đó là **thiết kế**, không phải bug; muốn đúng tuyệt đối thì đặt giờ sau 14h hoặc trả phí.

### 3e. Nhắc hẹn — vì sao thành loại rule riêng
- **Đã thử: coi nhắc hẹn như rule định kỳ.** Vỡ 3 chỗ: giới hạn "tối thiểu 30 phút" chặn "nhắc tôi 5 phút nữa"; cron 15' làm nhắc trễ tới 15 phút; và từng **bắn 2 lần + bắn trước giờ** khi nhiều lượt run-monitor chạy chồng (cron chính + tick + quét khi mở app).
- **Hiện tại:** `source_type='reminder'` + `remind_at` (timestamptz, AI tự quy đổi giờ tương đối "10 phút nữa" từ thời điểm hiện tại được bơm vào đầu prompt); tick mỗi phút bắn đúng phút; claim nguyên tử chống đúp; bắn xong **tự xóa rule nhưng GIỮ thông báo** — mà muốn vậy phải làm migration 0021 cho `notifications.user_id` (xem mục 6b).

### 3f. Tiết kiệm quota thêm
- **Hash-gate (2026-07-04):** trang web y nguyên lần trước (vân tay FNV-1a trên text đã gọn khoảng trắng, lưu `rules.last_content_hash`) → skip 0 call AI. Không áp cho quét tay và rule ghim giờ.
- **Cache RSS theo category trong 1 lượt run** — 5 rule tin tức cùng loại chỉ fetch bộ feed 1 lần (cache cả kết quả hỏng để khỏi thử lại n lần).
- **`isAiFreeRule`:** kẹt quota giữa lượt thì chỉ bỏ các rule cần AI, rule 0-AI (nhắc hẹn, thời tiết/giá không điều kiện) vẫn quét tiếp. Trước đây `break` cả lượt → bản tin 8h 0-AI cũng "chết chùm" chỉ vì đứng sau 1 rule tin tức hết quota.
- **Cảnh báo chủ động:** vượt ~80% trần grounding → push cho admin, mỗi ngày 1 lần.

---

## 4. CHỐNG THÔNG BÁO TRÙNG & RÁC — 7 lần vá mới "êm"

1. **Dedup theo URL** (đầu tiên) → vỡ khi URL grounding đổi mỗi lần gọi → **chuyển sang tiêu đề chuẩn hóa** (lowercase, gọn khoảng trắng).
2. **Chủ đề số liệu bị chặn oan:** trang giá vàng URL đứng yên mãi → dedup chặn vĩnh viễn → thêm **`last_value`**: cùng tiêu đề/URL nhưng số liệu ĐỔI thì vẫn báo (migration 0008). Rồi vá tiếp chiều ngược lại: chưa có mốc cũ thì KHÔNG tự nhận "đã đổi" (hết báo lặp mỗi phiên).
3. **Vòng lặp chết filler (2026-07-02):** Gemini luôn trả đúng 1 bài nổi nhất → trùng tiêu đề đã gửi → bị chặn mãi → user toàn nhận "chưa có thay đổi". Sửa gốc: đưa **~8 tiêu đề bài THẬT đã gửi vào prompt** (`avoidTitles`) bảo Gemini né, chỉ nhắc lại nếu số liệu trong bài đã đổi; lọc filler ra khỏi danh sách này kẻo phí chỗ prompt (`isFillerTitle`).
4. **Filler không push (2026-07-01):** tin trạng thái ("chưa có thay đổi"/"chưa tìm thấy") gần như vô giá trị để rung máy → chỉ lưu trong app; đã thử gắn theo `notify_mode` lúc tạo rule nhưng rule CŨ vẫn `all` → sửa GỐC ở `insertNotif` (tham số `push=false` cho mọi filler), trừ rule đặt giờ (bản tin đúng hẹn user chủ động yêu cầu — vẫn push).
5. **Chế độ "Chỉ báo tin quan trọng"** per-rule (migration 0015) + banner gợi ý bật hàng loạt cho rule cũ dễ ồn + nút **"Soi bộ lọc"** trên trang test: chạy 1 lượt Gemini thật rồi cho xem CẢ 2 chế độ sẽ quyết định gì — để tin vào bộ lọc thay vì đoán.
6. **Dedup 2 lớp tiêu đề + LINK chuẩn hóa (2026-07-04):** báo sửa tít nhẹ nhưng cùng link vẫn bị bắt (`normLink`: bỏ utm_*/fbclid/fragment/www/trailing-slash, sort query).
7. **Rule đặt giờ gửi trùng nhiều ngày (2026-07-10, mới nhất):** rule ghim giờ cố tình BỎ QUA dedup ("luôn giao đúng hẹn") → trang trending giữ nguyên top vài ngày → AI viết y một tiêu đề → lặp nguyên văn mỗi sáng. Sửa 2 lớp: đường đọc-trang cũng nhận `avoidTitles` (có tin mới → nêu điểm MỚI + title khác; y cũ → GIỮ title cũ, cấm diễn đạt lại để lách dedup); nội dung trùng thật → gửi **"Chưa có thay đổi mới"** trỏ `related_notification_id` về thông báo thật gần nhất thay vì bản sao.

Cộng thêm: **Giờ yên lặng** (bảng `user_settings`, server bỏ qua push trong khung user đặt, xử lý vắt nửa đêm), **"Để êm"** per-rule (cột `muted` — vẫn lưu tin, không push), fallback "chưa có thay đổi" **link về thông báo trước** trong app (cột `related_notification_id`, migration 0009 — vì không có URL bài mới để trỏ).

---

## 5. THEO DÕI TRANG WEB THEO URL — khảo sát thật từng nguồn

### 5a. Đọc trang thế nào?
- **Nền tảng:** `_shared/webwatch.ts` fetch với UA trình duyệt + timeout 15s; strip HTML bằng regex (đủ cho AI đọc text, không cần DOM chuẩn); **chặn SSRF** (cấm localhost/IP private/metadata — run-monitor chạy service_role, tuyệt đối không được fetch hộ vào mạng nội bộ theo URL người dùng đưa).
- **Đã thử: cho AI đọc thẳng HTML-đã-strip của mọi trang.** Vấn đề: thông báo trỏ về trang chủ thay vì bài cụ thể; trang tin tức dedup kém.
- **Hiện tại: ưu tiên FEED trước.** Trang tự khai báo RSS/Atom trong `<head>` (đa số trang tin, WordPress, GitHub) → đọc feed: tiêu đề + link bài CHUẨN. Không có feed → AI đọc text kèm **danh sách link bài bóc từ anchor** để CHỌN đúng bài (anchor text ≥20 ký tự mới tính là tiêu đề bài — lọc menu/nút).

### 5b. Mạng xã hội — khảo sát bằng fetch thật (2026-07-03), quyết định theo dữ liệu
| Nguồn | Kết quả thử | Quyết định |
|---|---|---|
| Telegram `t.me/kênh` | Chỉ card giới thiệu; bản `t.me/s/kênh` mới có nội dung | ✅ tự quy đổi sang `/s/` |
| Reddit | HTML mới là SPA không khai feed; thêm `/.rss` là có feed chuẩn | ✅ tự quy đổi `.rss` |
| YouTube kênh | Trang `/@tên` chặn bot; `feeds/videos.xml?channel_id=UC…` mở tự do | ✅ quy đổi (chỉ dạng `/channel/UC…`) |
| Bluesky, Mastodon, Substack | Có RSS chính chủ | ✅ dùng feed |
| **Facebook** | Trả **vỏ rỗng 1.5KB** cho bot, JS render + chống bot, cookie không cứu | ❌ BỎ — từ chối khéo + gợi ý nguồn thay thế |
| **X/Twitter** | Từ 2/2026 đọc phải trả phí API pay-per-use | ❌ BỎ (làm sau nếu user cần) |
| Instagram/TikTok | Chặn bot tương tự FB | ❌ BỎ |

Tất cả quy đổi nằm trong `normalizeWatchUrl` — người dùng dán link nào quen tay cũng chạy. Tầng trên nữa là "**BẢN ĐỒ NGUỒN**" trong generate-rule: "dự án nổi bật GitHub mỗi sáng" tự dựng `github.com/trending` — người dùng khỏi biết link kỹ thuật.

### 5c. Trang cần đăng nhập
- **Đã thử: WebView đăng-nhập-1-chạm** (màn `grant-login`, gom `document.cookie`) — chạy được Expo Go nhưng **cookie HttpOnly không lấy được** qua JS, web thì không có WebView → vẫn giữ làm đường phụ.
- **Hiện tại:** trang trả 401/403 (hoặc AI phát hiện nội dung bị che sau form login) → thông báo 🔒 hướng dẫn dán Cookie từ DevTools vào chi tiết rule (`watch_auth` — nhận cả dạng header từng dòng lẫn chuỗi cookie trần). Từng bị **"hỏi quyền oan"** (trang công khai có nút "Đăng nhập" trên menu làm AI nhận nhầm) → chốt chặn: trang có >6000 ký tự text đọc được thì gần như chắc là trang công khai, không hỏi.

---

## 6. BACKEND SUPABASE — những cú vấp có tên riêng

### 6a. Vì sao Supabase (thay vì tự dựng server)
Một người làm, cần: Postgres + Auth + phân quyền + serverless function + cron + secret — Supabase cho đủ trong free tier, không phải nuôi VPS. RLS làm "user chỉ thấy dữ liệu của mình" thành ràng buộc Ở TẦNG DATABASE (client có bug cũng không đọc trộm được). Phân quyền run-monitor: cron gửi service_role = quét tất cả; app gửi JWT user = chỉ quét rule CỦA MÌNH, userId lấy **từ token** chứ không tin body (anon key là công khai, không thể tin request tự xưng).

### 6b. Quan hệ notifications ↔ rules — 3 phiên bản
- **V1: xóa rule phải tự xóa notifications con thủ công** (ở cả admin-api lẫn client) — dễ sót, dính lỗi FK 23503.
- **V2 (migration 0014): `ON DELETE CASCADE`** — sạch code workaround. Nhưng lộ vấn đề mới với nhắc hẹn: nhắc xong muốn XÓA rule mà GIỮ thông báo → cascade kéo thông báo chết theo.
- **V3 (migration 0021): `notifications.user_id`** — thông báo có chủ sở hữu TRỰC TIẾP, "sống sót" khi rule bị xóa (detach: set user_id, rule_id=null rồi mới xóa rule); RLS thêm nhánh user_id; client lọc theo user_id (helper `lib/notifQuery.ts` tự fallback qua rule_id nếu migration chưa chạy).

### 6c. Cron gọi Edge Function — vụ 401 mất nhiều ngày nhất
- **Sự cố 1 (2026-06-20):** cron 401 `UNAUTHORIZED_INVALID_JWT_FORMAT`. Nguyên nhân: project dùng API key kiểu MỚI (`sb_secret_...`) — **không phải JWT** — trong khi Edge Function (verify_jwt) đòi JWT.
- **Sự cố 2 (2026-07-03):** user chạy lại mọi migration → file cũ dính placeholder `<SERVICE_ROLE_KEY>` + file tick dán nhầm ANON key → cron chết im nhiều ngày ("thời tiết im từ hôm qua").
- **Chốt quy tắc (0019_fix_cron_keys.sql):** cron PHẢI dùng **legacy service_role JWT** (dạng `eyJ...`, payload có `"role":"service_role"`); debug bằng `net._http_response` (không phải `cron.job_run_details`); mọi file migration có key đều ghi chú to đùng cách lấy key đúng. Kèm bài học phụ: user dán key vào chat/ảnh chụp → phải rotate.
- **Tự giám sát để không "chết im" lần nữa (migration 0020):** cột `rules.last_error` (lỗi quét hiện ngay trong chi tiết rule), bảng `cron_runs` (mỗi lượt: quét mấy rule, ra mấy tin, có kẹt quota, chạy bao lâu), **watchdog thuần SQL** push cho admin khi quét nền chết >50 phút.

---

## 7. FRONTEND — React Native + Expo và các cú sập có thật

### 7a. Vì sao Expo/React Native
1 codebase chạy Android + iOS + Web; Expo Go thử trên máy thật qua QR không cần Android Studio; **EAS Update (OTA)**: sửa JS xong đẩy thẳng tới máy người dùng không cần phát hành lại APK — với dự án 1 người sửa nhiều lần mỗi ngày, OTA là tính năng "sống còn". Đổi lại phải tôn trọng kỷ luật: **mọi thay đổi test cả web LẪN Expo Go** — vì các cú sập dưới đây đều chỉ hiện ở MỘT nền:

| Sự cố (thật) | Nguyên nhân | Cách giải hiện tại |
|---|---|---|
| Crash/màn trắng Expo Go, web vẫn chạy (06-19) | Reanimated 4 nhưng babel còn plugin cũ `react-native-reanimated/plugin` → worklet không biên dịch | Đổi `react-native-worklets/plugin`, bọc app bằng `GestureHandlerRootView` |
| Web sập màn tạo rule sau khi thêm giọng nói (07-05) | `import expo-audio` trên web — `AudioRecorderWeb extends globalThis.expo.SharedObject` nổ NGAY LÚC IMPORT | **Tách file theo nền tảng** `voiceInput.web.ts` / `voiceInput.ts` + file types chung — `Platform.OS` check KHÔNG đủ vì import đã nổ trước khi check chạy |
| Điện thoại (binary cũ) vẫn sập dù đã lazy-require + try/catch (07-06) | OTA chỉ thay JS — binary cũ KHÔNG có native module `ExpoAudio`; metro `guardedLoadModule` ném lỗi ngoài tầm try/catch | Chấp nhận ranh giới OTA: thêm native module là phải build binary mới; JS phải dò module tồn tại trước khi đụng |
| Bàn phím che ô nhập Android (06-20) | Edge-to-edge Android không tự resize, `KeyboardAvoidingView behavior=undefined` | `behavior="padding"` cho cả 2 nền |
| Web export `output:"static"` crash | SSR đụng AsyncStorage lúc render tĩnh | Chốt `web.output = "single"` (SPA 1 file) — BẮT BUỘC, đã ghi memory |
| `Alert.alert` không hiện trên web | RN Web không có Alert native | `lib/dialog.ts`: `alertMessage()`/`confirmAsync()` dùng chung 2 nền |

### 7b. Tốc độ mở app & chuyển màn — 4 đợt tối ưu (mỗi đợt do user than thật)
- **Đợt 1 (07-03, "mở app load lại mọi thứ lâu"):** trước đó KHÔNG có cache — mọi màn chờ mạng xong mới vẽ. Thêm `lib/screenCache.ts` (AsyncStorage, kiểu **stale-while-revalidate**: vẽ ngay dữ liệu cũ, mạng về thay bản mới), query nối đuôi → chạy song song `Promise.all`, thông báo chỉ lấy 100 dòng gần nhất thay vì toàn bộ lịch sử.
- **Đợt 2 (07-07, "delay mọi thứ khi mới mở"):** giữ splash native tới khi auth sẵn sàng (`preventAutoHideAsync`) — hết chớp màn trắng; preload font icon (trần chờ 3s — không để font mạng chậm giam app); `getSession` timeout 6s (không kẹt màn chờ vì refresh token treo).
- **Đợt 3 (07-07, ảnh chụp "vào tab Alerts vẫn chờ tải"):** cache đĩa là async nên khung hình đầu vẫn trống → nâng cache thành **2 tầng RAM + đĩa** (`getMemCache` đọc ĐỒNG BỘ, dùng thẳng trong `useState` initializer) + **`lib/prefetch.ts`**: có session là kéo đĩa→RAM + 4 query mạng song song đổ sẵn vào đúng khóa cache của MỌI tab — bấm sang tab nào dữ liệu cũng hiện ngay khung hình đầu.
- **Đợt 4 (07-10, "chuyển trang lần đầu lag vài giây"):** thủ phạm còn lại là RENDER — 2 màn vẽ 100 card `ReanimatedSwipeable` một lượt trong ScrollView+map (đợt 3 vô tình làm nặng thêm: cache RAM đầy nên khung hình đầu render đủ 100 item). → **FlatList ảo hóa** (initialNumToRender=8, chỉ vẽ ~10 dòng quanh khung nhìn). Kèm bug hồi quy đã vá: ScrollView ngang (chips lọc) đứng cạnh FlatList bị bóp dẹp → khóa height + flexShrink:0.

### 7c. Tự cập nhật phiên bản
- **Web:** `lib/webAutoUpdate.ts` — định kỳ 60s + khi quay lại tab, fetch `index.html` no-store, so chữ ký file js/css băm; khác = vừa deploy → reload. (Lần kiểm đầu lùi 10s để không tranh tài nguyên lúc mở app.)
- **Native:** `lib/nativeAutoUpdate.ts` — `checkForUpdateAsync → fetchUpdateAsync → reload` khi mở app (expo-updates, runtimeVersion policy appVersion).
- **Bẫy thứ tự deploy (đã dính, đã ghi memory):** `eas update` GHI ĐÈ `dist/` → phải `expo export -p web` LẠI trước `eas deploy`, không thì web 404. Thứ tự chuẩn: **OTA → export web → deploy web**.

### 7d. Push notification
Expo Push API: 1 endpoint lo cả FCM + APNs, không phải viết native. Hạ tầng Android: Firebase project + `google-services.json` (khóa CLIENT công khai theo thiết kế — commit được; `fcm-service-account.json` thì gitignore tuyệt đối). Token chết (user gỡ app) → Expo trả `DeviceNotRegistered` → server tự xóa khỏi `push_tokens`. Chạm push mở đúng màn chi tiết thông báo (`notificationId` trong data).

### 7e. Giọng nói (2 đường vì 2 nền khác hẳn nhau)
- **Web:** Web Speech API của trình duyệt — chữ hiện dần theo lời nói, 0 quota (Firefox không hỗ trợ thì ẩn nút).
- **Mobile:** Web Speech không có → `expo-audio` ghi âm → Edge Function `transcribe` (JWT bắt buộc) → Gemini chép lời (gemini.ts nhận `audio` inline_data). Chuỗi sự cố import của tính năng này chính là nguồn của quy tắc "tách file .web.ts" ở bảng 7a.

---

## 8. CHẤT LƯỢNG & VẬN HÀNH

### 8a. Test
- **Đã có lúc: 8/9 suite CRASH** (thiếu mock AsyncStorage/expo-font/safe-area) — bộ test tồn tại mà vô dụng. Hồi sinh 2026-06-24: mock chuẩn trong `__tests__/setup.ts`, các test lệch UI viết lại. Hiện **11 suite / 140 test pass**.
- **Nguyên tắc ăn tiền nhất:** logic thuần của server (lịch quét `isDue/dueAt/isTickDue`, chống trùng, chọn tin, parse feed...) tách vào `_shared/monitorLogic.ts` **không import Deno API** → jest (Node) test được ĐÚNG code chạy thật trên server, không phải bản chép lại.
- **Kiểm thử hệ AI bằng kịch bản thật:** `scripts/scenario-test.mjs` — 23 kịch bản 7 nhóm (số liệu, tin tức, phải-hỏi-lại, nhắc hẹn, bản đồ nguồn, URL, từ chối khéo) gọi generate-rule THẬT, kết quả chấm trong KICH_BAN_TEST.md. Chính bộ này lôi ra 2 bug server nặng (mục 8b) và các case "hỏi thừa".

### 8b. Deploy Edge Function — vì sao phải có "probe"
- **Sự cố nền tảng (2026-07-08):** `gemini.ts` khai báo `const parts` 2 lần = SyntaxError. tsc/jest **không phủ code Deno** → lọt mọi kiểm tra, deploy "thành công", function **SẬP LÚC BOOT** — mà function cũ vẫn chạy bundle cũ nên lỗi ẩn: transcribe chết âm thầm 3 NGÀY không ai biết.
- **Hiện tại:** `scripts/deploy-functions.mjs` gộp **deploy + probe** làm một: gọi thử TỪNG function bằng body RẺ (bị chặn ở validate/auth trước khi tốn quota), phân loại sập bằng field `code` của phản hồi nền tảng (BOOT_ERROR/WORKER_ERROR — code app không bao giờ dùng field `code`). Sửa `_shared/*` = deploy lại MỌI function dùng nó. Quy tắc đã ghi memory: deploy xong PHẢI probe ngay.

### 8c. Trang admin & trang test
Admin: quota theo từng model, user, log. Trang test (`/admin-test`): **dry-run kế hoạch quét** (rule nào tới hạn, thứ tự ưu tiên, còn chờ bao lâu — 0 quota; đây là NGUỒN DUY NHẤT của logic lịch, client không tính lại), "Soi bộ lọc" per-rule, kết quả quét dễ đọc (`notes[]`: real/nochange/related/none/skipped). Khi cần soi dữ liệu thật: `scripts/audit-sai-gio.sql` (5 khối SQL dán vào Supabase — thông báo lệch mấy phút so run_at, khung giờ nào kẹt quota, tick còn sống không...).

### 8d. Bảo mật khi public repo (2026-07-08)
Rà toàn bộ lịch sử git trước khi mở: `.env`/`fcm-service-account.json` chưa từng commit; đúng 1 chuỗi ANON key (khóa công khai) từng lọt vào 1 migration → vẫn **tẩy khỏi toàn bộ lịch sử bằng git-filter-repo** + force push (backup bundle trước). Bài học kèm theo: key thật chỉ được nằm ở Supabase secret/dashboard; migration commit lên git chỉ chứa placeholder.

---

## 9. NHỮNG PHƯƠNG ÁN ĐÃ CÂN NHẮC RỒI BỎ (tóm tắt để khỏi bàn lại)
| Phương án | Vì sao bỏ |
|---|---|
| Ollama local | Máy phải bật 24/7, không public được, model yếu |
| Gemini trả phí Tier 1 | Thẻ Visa ảo bị Google từ chối → thiết kế quanh free tier (hóa ra tốt hơn) |
| App tự quét khi mở | Trùng với cron, đốt quota gấp đôi — client chỉ đọc |
| Trần cứng MAX_RULES_PER_RUN | `isDue` per-rule là quota gate tự nhiên; trần cứng làm rule trễ oan |
| Quét sớm trước giờ hẹn | Lịch hẹn mà gửi trước giờ là sai; nhắc hẹn từng bắn trước giờ vì logic này |
| AI tự ghi source_url | Bịa URL — phải lấy link từ grounding metadata / feed / danh sách anchor |
| Theo dõi Facebook/IG/TikTok/X | FB trả vỏ rỗng cho bot (đã fetch thử); X bắt trả phí API |
| Đăng nhập 1-chạm WebView làm đường chính | Cookie HttpOnly không lấy được qua JS; web không có WebView — giữ làm đường phụ, chính vẫn là dán Cookie |
| Digest bản tin sáng (gộp nhiều rule) | User chốt "không cần lắm" — nằm backlog |
| Xóa notifications con thủ công khi xóa rule | FK CASCADE (0014) rồi user_id detach (0021) đúng bản chất hơn |
