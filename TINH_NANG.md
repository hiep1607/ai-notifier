# TINH_NANG.md — Chi tiết cách hoạt động & khả năng của từng chức năng

> File này khác [KE_HOACH.md](KE_HOACH.md) (theo dõi tiến độ/backlog) và [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md)
> (kiến trúc tổng thể). File này trả lời câu hỏi: **"chức năng X hoạt động thế nào, làm được gì, ví dụ ra sao?"**
>
> **QUY TẮC CẬP NHẬT:** mỗi khi làm xong 1 chức năng mới hoặc đổi hành vi 1 chức năng có sẵn, cập nhật
> đúng mục tương ứng bên dưới (thêm mục mới nếu là chức năng mới hẳn). Không cần ghi ngày/lịch sử ở đây
> — lịch sử thay đổi đã có ở KE_HOACH.md, file này chỉ tả TRẠNG THÁI HIỆN TẠI.

---

## 1. Tổng quan luồng hoạt động

```
Người dùng mô tả (chat / mẫu nhanh / form)
        │
        ▼
generate-rule (Gemini) ── phân tích: chủ đề? loại theo dõi? tần suất? điều kiện?
        │                  hỏi lại nếu thiếu, KHÔNG tự bịa
        ▼
   Rule được tạo (bảng `rules`)
        │
        ▼
pg_cron (mỗi 15 phút) ─────► run-monitor ─── ROUTER chọn nguồn theo từ khóa/loại rule:
                                               │
                              ┌────────────────┼─────────────┬──────────────┬─────────────┐
                              ▼                ▼              ▼              ▼             ▼
                          Nhắc hẹn        Thời tiết       Giá coin      Tỷ giá      Tin tức/khác
                        (0 AI, tự tắt)   (Open-Meteo)    (CoinGecko)   (er-api)   RSS báo VN → Gemini
                                                                                   search (fallback)
        │
        ▼
   notifications (bảng) → push Expo (trừ khi mute / giờ yên lặng / filler)
```

**Nguyên tắc xương sống:** mỗi loại theo dõi có nguồn dữ liệu càng CHUYÊN BIỆT càng tốt (API thật,
0 quota) — Gemini + Google Search chỉ còn là phương án cuối cho chủ đề tự do hoặc khi provider hỏng.

---

## 2. Cách tạo rule

### 2a. Chat với AI (màn "Tạo rule")
Mô tả tự nhiên bằng tiếng Việt, AI (Gemini, Edge Function `generate-rule`) hỏi lại nếu thiếu thông tin,
tuyệt đối không tự bịa điều kiện/tần suất. Có thể tách **1 câu thành nhiều rule** nếu nói nhiều chủ đề
độc lập (vd "báo giá vàng và bitcoin mỗi sáng" → 2 rule).

Sau khi AI trả kết quả, hiện **card xem trước** — người dùng bấm "Tạo rule" mới thật sự lưu (chưa lưu
ngay, có thể "Chỉnh sửa" để mô tả lại).

### 2b. Mẫu nhanh (Quick Templates)
6 mẫu bấm 1 chạm, **KHÔNG gọi AI** (chạy được cả khi Gemini kẹt quota): Giá vàng, Tỷ giá USD, Giá
Bitcoin, Giá xăng, Thời tiết Hà Nội, Tin công nghệ. Cũng hiện card xem trước trước khi tạo.

### 2c. Sửa tay (màn chi tiết rule)
Đổi từ khóa/danh mục/tần suất/điều kiện trực tiếp, không qua AI.

---

## 3. CÁC LOẠI THEO DÕI (rule types) — chi tiết

Router (`detectSourceType` trong `supabase/functions/_shared/monitorLogic.ts`) tự nhận diện loại theo
dõi **dựa vào từ khóa (keyword) của rule, chạy lúc quét** — không cần chọn tay, không cần migration
khi thêm loại mới dựa-trên-heuristic. Provider lỗi → tự rơi về Gemini search, rule không bao giờ "chết".

### 3a. 🌤 Thời tiết — provider Open-Meteo (0 quota, free, không cần key)
- **Nhận diện:** từ khóa chứa "thời tiết"/"dự báo thời tiết"/"nhiệt độ"/"weather".
- **Cách hoạt động:** tách địa danh khỏi câu (vd "dự báo thời tiết Thanh Hóa hôm nay" → "Thanh Hóa") →
  gọi Open-Meteo geocoding tìm tọa độ → gọi forecast lấy nhiệt độ hiện tại + dự báo hôm nay/ngày mai
  (nhiệt độ min/max, xác suất mưa, mã thời tiết WMO → mô tả tiếng Việt, gió tối đa).
- **Bản tin dựng bằng TEMPLATE** (không gọi AI) → chính xác tuyệt đối, không tốn quota Gemini.
- **Ví dụ tạo rule:** "báo thời tiết Thanh Hóa mỗi ngày lúc 8h", "thời tiết Hà Nội hằng ngày".
- **Không tách được địa danh** (vd chỉ nói "thời tiết") → rơi về Gemini search.

### 3b. 🪙 Giá Coin — provider CoinGecko (0 quota, free, không cần key)
- **Nhận diện:** từ khóa có Ý "giá" + tên coin phổ biến (BTC/Bitcoin, ETH/Ethereum, BNB, SOL/Solana,
  XRP/Ripple, DOGE/Dogecoin, ADA/Cardano, TON/Toncoin). "Tin tức bitcoin" (không có ý giá) vẫn là rule
  tin tức thường (RSS), không bị cướp.
- **Cách hoạt động:** gọi CoinGecko simple/price lấy giá USD + quy đổi VND + % biến động 24h.
- **Ví dụ:** "giá Bitcoin BTC hôm nay", "báo khi ETH giảm hơn 5%" (rule theo điều kiện — xem mục 4b).
- Coin không có trong danh sách trên → rơi về Gemini search.

### 3c. 💱 Tỷ giá — provider open.er-api.com (0 quota, free, không cần key)
- **Nhận diện:** từ khóa có "tỷ giá"/"USD/VND"/"exchange rate".
- **Cách hoạt động:** lấy tỷ giá USD/VND tham khảo (KHÔNG phải giá niêm yết ngân hàng), nêu chênh lệch
  so với lần quét trước nếu có.
- **Ví dụ:** "tỷ giá USD/VND hằng ngày lúc 8h".
- Giá vàng SJC/xăng dầu **CHƯA có provider riêng** (chưa tìm được API sạch/free) → vẫn đi RSS/search.

### 3d. 📰 Tin tức — RSS báo Việt Nam (không grounding, rẻ)
- **Áp dụng:** MỌI rule không rơi vào 3 loại trên (tin tức, công nghệ, thể thao, sức khỏe, chủ đề chung...).
- **Cách hoạt động:**
  1. Lấy feed RSS theo `category` của rule (finance→CafeF+VnExpress Kinh doanh, tech→VnExpress Số hóa
     +Khoa học, news→VnExpress Thời sự+Tin mới nhất, sports→VnExpress Thể thao+Tuổi Trẻ, health→VnExpress
     Sức khỏe, other→Tin mới nhất VnExpress+Tuổi Trẻ).
  2. Gộp nhiều feed, bỏ trùng link, mới nhất trước.
  3. Lọc bỏ bài đã gửi trước đó (so tiêu đề — feed ổn định tuyệt đối nên dedup chuẩn).
  4. Gemini **flash-lite** (KHÔNG Google Search grounding → không đụng quota 1.500/ngày, rẻ hơn nhiều)
     chọn bài hợp chủ đề nhất trong danh sách còn lại + tóm tắt.
  5. Link bài = **link THẬT từ feed** (hết hẳn chuyện AI bịa/sai link).
- Feed không có gì mới / không bài liên quan → gửi fallback theo luật chung (mục 5), **không đốt
  grounding**. Chỉ khi hạ tầng RSS hoặc flash-lite hỏng mới rơi xuống Gemini + Google Search (grounding
  = phương án cuối cùng).
- **Ví dụ:** "tin công nghệ AI mới nhất", "tin thể thao Việt Nam", "theo dõi giá vàng SJC" (chưa có
  provider riêng nên đi đường này).

### 3e. 🔍 Tìm kiếm tự do — Gemini + Google Search grounding (phương án cuối, tốn quota)
- Dùng khi: chủ đề không khớp 4 loại trên, HOẶC provider/RSS/flash-lite bị lỗi.
- AI tự tìm tin thật trên web, trả về bài + tóm tắt + link nguồn (link ưu tiên lấy từ metadata
  grounding thật, không dùng URL AI tự ghi vì hay bịa).
- Quota free tier: **1.500 lượt gọi grounding/ngày**, reset theo giờ Thái Bình Dương (~14h VN).

### 3f. ⏰ Nhắc hẹn (reminder) — 0 AI, chỉ lịch + push
- **Cách tạo:** chat "nhắc tôi [việc] ngày [X] lúc [giờ]" — AI nhận diện đây là NHẮC HẸN (không phải
  theo dõi tin), tự quy đổi ngày tháng dựa trên ngày giờ VN hiện tại (thiếu ngày → hỏi lại; không nói
  giờ → mặc định 08:00; ngày đã qua trong năm nay → tự hiểu là năm sau).
- **KHÔNG có giới hạn thời gian tối thiểu:** quy tắc "tối thiểu 30 phút" chỉ áp cho theo dõi ĐỊNH KỲ.
  Nhắc hẹn đặt được bất kỳ lúc nào trong tương lai, kể cả "nhắc tôi 5 phút nữa". AI hiểu giờ TƯƠNG ĐỐI
  ("5 phút nữa", "2 tiếng nữa", "tối nay") và tự cộng từ giờ hiện tại.
- **Độ chính xác tới PHÚT:** ngoài cron chính 15'/lần còn có cron phụ `reminder-tick` chạy MỖI PHÚT
  (migration `0017`) — chỉ là 1 câu SQL kiểm tra "có nhắc hẹn nào tới hạn chưa bắn không", CÓ mới gọi
  run-monitor (không thì 0 tốn gì). Reminder tới hạn được ưu tiên quét ĐẦU TIÊN trong hàng đợi.
- **Khác biệt với rule đặt giờ (mục 4c):** nhắc hẹn chỉ bắn **ĐÚNG 1 LẦN** rồi rule **tự tắt**; rule đặt
  giờ là lịch hẹn LẶP LẠI (hằng ngày/tuần) để theo dõi tin.
- **Cách hoạt động khi tới hạn:** không gọi AI — push thẳng "⏰ Nhắc hẹn: [nội dung]" kèm giờ hẹn; nếu
  hệ thống bận nên nhắc muộn thì nêu rõ số phút trễ trong nội dung (không bao giờ bỏ qua, dù muộn bao lâu).
- **Chống bắn TRÙNG (fix 2026-07-03):** nhiều lượt quét có thể chạy chồng nhau (cron 15' + tick mỗi
  phút + quét khi mở app + "Kiểm tra tin ngay") — trước đây 2 lượt cùng thấy "chưa bắn" là nhận 2 push.
  Giờ trước khi bắn phải GIÀNH QUYỀN bằng UPDATE nguyên tử ở Postgres: chỉ 1 lượt thắng, lượt kia im.
  Đồng thời bấm "Kiểm tra tin ngay" với nhắc hẹn CHƯA tới giờ sẽ không bắn sớm nữa (trả "bỏ qua").
- **Ví dụ:** "nhắc tôi nộp bài tập lớn ngày 20/7 lúc 9h sáng", "nhắc tôi uống thuốc 9h tối nay",
  "nhắc tôi 5 phút nữa tắt bếp".
- **YÊU CẦU:** migration `0016_rule_reminder.sql` (✅ đã chạy) + `0017_reminder_tick.sql` (✅ đã chạy
  2026-07-03 — nếu nhắc hẹn vẫn trễ ~15' thì nghi key cron dán nhầm anon, xem mục 8).

### 3g. 🌐 Theo dõi TRANG WEB/APP CỤ THỂ theo URL (Pha E — thêm 2026-07-03)
- **Dùng khi:** người dùng muốn theo dõi 1 TRANG cụ thể do mình chọn (giá 1 sản phẩm trên shop,
  chương mới của truyện, trạng thái đơn hàng, bài mới trên blog, bảng điểm...) — kể cả trang
  **cần đăng nhập**. App di động thuần (không có bản web) thì KHÔNG theo dõi được — AI sẽ gợi ý
  dùng bản web của dịch vụ đó.
- **Cách tạo:** chat kèm link, vd "báo tôi khi sản phẩm này giảm dưới 500k https://shop.vn/ao-khoac".
  AI đặt `source_type='url'` + `watch_url`; muốn theo dõi trang cụ thể mà chưa đưa link → AI hỏi xin link.
  Rule cũ/gõ tay có URL nằm ngay trong keyword cũng tự được nhận diện (không cần migration cho phần này).
- **Cách hoạt động mỗi lượt quét:** server fetch trang (UA trình duyệt, timeout 15s, đọc tối đa 400KB), rồi:
  1. **Ưu tiên FEED trang tự khai báo** (nâng cấp 2026-07-03, cho trang TIN TỨC/blog): nếu trang khai
     `<link rel="alternate" type="application/rss+xml">` trong HTML (Tuổi Trẻ, CafeF, WordPress...) →
     đọc feed đó: bài CHƯA GỬI → flash-lite chọn bài hợp chủ đề + tóm tắt → thông báo có **link bài
     THẬT** + chống trùng tuyệt đối theo tiêu đề feed. Feed không có/không bài mới liên quan → bước 2
     (rule giá trên trang có feed blog không bị "cướp").
  2. **Đọc HTML trang**: bỏ tag lấy text + trích danh sách **link bài trên trang** đưa cho
     **flash-lite** (KHÔNG grounding, không đụng quota 1.500) → AI trích `value` + tóm tắt + CHỌN link
     bài khớp → thông báo trỏ đúng bài viết thay vì trang chủ.
  - Cổng gửi: có điều kiện → chỉ báo khi AI chấm THỎA trên nội dung trang thật (cooldown 6h, bỏ khi đổi
    ≥3%); đặt giờ → luôn giao bản tin đúng hẹn; định kỳ thường → **chỉ báo khi có NỘI DUNG MỚI** (bài
    chưa gửi / giá trị đổi — đọc lại trang mà y nguyên thì im, không spam cùng 1 bài).
- **Trang cần ĐĂNG NHẬP — flow "cấp quyền" (làm lại 2026-07-03 cho dễ dùng):** app TỰ phát hiện trang
  đòi đăng nhập (HTTP 401/403 hoặc AI thấy nội dung che sau form login) → gửi 1 thông báo "🔒" (không
  spam lặp). Trên thông báo có **nút "Cấp quyền truy cập"** đi thẳng tới khối cấp quyền của rule (viền
  nổi). Tại đó người dùng chọn: **"Mở trang để đăng nhập"** → copy Cookie → dán → bấm **"Cho phép"**;
  hoặc bấm **"Không cho phép"** = tạm dừng rule, hệ thống thôi nhắc (bật lại bằng công tắc). Đã cấp thì
  có "Thu hồi quyền"/"Cập nhật". Cookie hết hạn → tự báo "🔒 Quyền đăng nhập hết hạn". Cookie nằm ở cột
  `watch_auth` — RLS chặn user khác đọc, chỉ chủ rule + hệ thống quét (service_role) thấy. *(Hạn chế
  hiện tại: bước copy Cookie vẫn thủ công — đăng nhập 1-chạm qua WebView cần build APK mới, để sau.)*
- **Nội dung thông báo ĐẦY ĐỦ (2026-07-03):** với tin từ RSS/feed, sau khi chọn bài hệ thống **fetch
  BÀI GỐC** và để flash-lite viết bản tin 4-6 câu + mục "Phân tích chi tiết" từ text thật của bài
  (trước chỉ tóm 1-2 câu từ mô tả feed nên sơ sài). Bài gốc chặn bot/quá nghèo → giữ bản tóm tắt cũ.
  Đường đọc-trang cũng trả thêm `details`.
- **Hiểu yêu cầu tự nhiên — BẢN ĐỒ NGUỒN (thêm 2026-07-03):** AI tạo rule TỰ DỰNG link cho nguồn phổ
  biến, người dùng không cần biết link kỹ thuật: "dự án nổi bật GitHub mỗi sáng" → `github.com/trending`
  (+ biến thể ngôn ngữ/tuần), release repo → `releases.atom`, "bài hot r/xyz" → Reddit `.rss`, kênh
  Telegram/Bluesky/Mastodon → link feed đúng. Server cũng **tự quy đổi link dán dạng thường**
  (`normalizeWatchUrl`): `t.me/kênh`→`t.me/s/kênh`, `reddit.com/r/x`→`.rss`, `bsky.app/profile/x`→`/rss`,
  `youtube.com/channel/UC…`→feed video. `parseRss` hiểu cả **Atom** (Reddit/YouTube/GitHub); watch_url
  là feed trực tiếp thì xử lý thẳng dạng feed. Người dùng đòi Facebook/Instagram/Threads/TikTok/Zalo/X
  → AI giải thích không hỗ trợ (chặn máy đọc / X đọc phải trả phí API) + gợi ý nguồn thay thế.
- **An toàn:** chặn SSRF (chỉ http/https tới host công khai — localhost/IP nội bộ/metadata cloud bị từ
  chối); trang sập/URL hỏng thì bỏ lượt đó chờ lượt sau, KHÔNG rơi xuống Gemini search (đỡ tốn quota,
  đỡ tin lạc đề). "Soi bộ lọc" ở Trang test hỗ trợ rule url (nhãn 🌐).
- **Ví dụ:** "theo dõi https://truyen.vn/abc, báo khi có chương mới" (change + condition), "mỗi sáng 8h
  báo giá phòng trên https://hotel.vn/x" (1440 + run_at 08:00).
- **YÊU CẦU:** migration `0018_url_watch.sql` (✅ đã chạy 2026-07-03) — tính năng dùng được đầy đủ.

---

## 4. Tần suất & lịch quét

### 4a. Định kỳ (số phút, tối thiểu 30)
Quét đều đặn mỗi N phút (N ≥ 30). Luôn gửi 1 bản tin mỗi chu kỳ tới hạn — tin thật nếu có, không thì
fallback trạng thái (mục 5), không bao giờ im lặng hoàn toàn.

### 4b. Theo điều kiện ("change")
Chỉ báo **KHI THỎA điều kiện** người dùng nêu (vd "khi giá vượt 80 triệu", "khi ETH giảm hơn 5%"), quét
ngầm mỗi 60 phút (không hiện số phút này ra người dùng). Rule provider (crypto/fx) chấm điều kiện bằng
**flash-lite trên SỐ THẬT** từ API (chính xác hơn nhờ AI đọc báo đoán số); có cooldown 6 tiếng giữa 2
lần báo liên tiếp (trừ khi biến động ≥3% thì báo lại ngay, không đợi cooldown).

### 4c. Đặt giờ cụ thể (`run_at`, giờ Việt Nam)
Ghim giờ báo cố định (vd "hằng ngày lúc 08:00"). Coi là **LỊCH HẸN người dùng chủ động đặt** — luôn giao
1 bản tin đúng hẹn kèm push (kể cả khi rule đang ở chế độ "Chỉ tin quan trọng" — chế độ lọc KHÔNG áp cho
rule đặt giờ, vì bản tin đúng hẹn chính là thứ được yêu cầu).
- **Catch-up 4 tiếng:** nếu lượt cron đúng giờ hẹn bị lỡ (quota Gemini cạn, quá tải, deadline xử lý),
  hệ thống tự thử lại các lượt cron sau trong vòng 4 tiếng kể từ giờ hẹn — không còn cảnh "lỡ 1 lượt là
  mất nguyên ngày".

---

## 5. Cơ chế chống thông báo rác (đã áp dụng)

| Cơ chế | Mô tả |
|---|---|
| **Chế độ thông báo per-rule** (`notify_mode`) | `all` (Đầy đủ, mặc định) hoặc `important` (Chỉ tin quan trọng — bỏ hẳn fallback, tin thật chỉ qua khi AI chấm `is_important` hoặc thỏa điều kiện). Đổi được bất cứ lúc nào ở chi tiết rule. **Không áp cho rule đặt giờ** (mục 4c) và **không áp cho nhắc hẹn**. Yêu cầu migration `0015_rule_notify_mode.sql`. |
| **AI tự đề xuất khi tạo rule** | `generate-rule` chấm `noise_risk` (`high`/`low`) mỗi rule — chủ đề rộng/định kỳ trên thứ ít biến động → `high`. Card xem trước hiện cảnh báo + tick "Chỉ báo tin quan trọng" **bật sẵn** cho rule `high`. |
| **Banner gợi ý cho rule cũ** | Màn Rules: nếu có rule định kỳ-không-điều-kiện-không-đặt-giờ còn ở chế độ Đầy đủ → banner "Bớt thông báo rác?" với nút bật hàng loạt 1 chạm. |
| **Filler không đẩy push** | Fallback "chưa có thay đổi"/"chưa tìm thấy"/"gợi ý liên quan" chỉ LƯU TRONG APP, không rung máy — TRỪ rule đặt giờ (bản tin đúng hẹn vẫn push). |
| **Dedup né vòng lặp chết** | Prompt Gemini search được truyền danh sách ~8 tiêu đề đã gửi để NÉ (trước đây hay trả đúng 1 bài nổi nhất → trùng mãi → toàn filler); nhận tối đa 3 ứng viên, chọn bài đầu tiên chưa trùng. RSS dedup theo tiêu đề feed (ổn định tuyệt đối, không cần AI). |
| **Freshness (bỏ bài quá cũ)** | Đường Gemini search: bài có `published_date` cũ hơn 7 ngày bị loại (không rõ ngày → giữ, an toàn cho chủ đề số liệu). |
| **Dọn push token chết** | Đọc ticket Expo Push sau khi gửi, token báo `DeviceNotRegistered` (app đã gỡ) bị xóa khỏi DB. |
| **Soi bộ lọc (Trang test)** | Xem mục 7 — công cụ kiểm chứng bộ lọc trên dữ liệu thật mà không tạo thông báo. |

---

## 6. Các tính năng khác đã có (theo rule / theo thông báo)

- **Để êm (mute) theo rule:** rule vẫn chạy & vẫn tạo thông báo trong app, chỉ KHÔNG đẩy push.
- **Giờ yên lặng (per-user):** khung giờ tùy chỉnh (vắt qua nửa đêm được) — trong khung này KHÔNG đẩy
  push cho bất kỳ rule nào (tin vẫn vào app). Cài ở Settings.
- **Nhóm thông báo theo ngày**, **lọc theo rule** (chip), **tìm kiếm**, **tab Chưa đọc/Quan trọng**,
  **vuốt xóa**, **chia sẻ** (native share sheet: tiêu đề + tóm tắt + link gốc).
- **AI Insight** ở Home: tóm tắt tin quan trọng/mới nhất thật, bấm mở đúng thông báo.
- **related_notification_id:** fallback "chưa có thay đổi" trỏ về thông báo thật gần nhất trong app
  (không có URL web) thay vì link chết.

---

## 7. Trang quản trị & Trang test (chỉ admin)

### 7a. Trang quản trị (`/admin`)
Tổng quan hệ thống (số user/rule/thông báo/push token), danh sách MỌI rule (lọc theo trạng thái, thao
tác Tạm dừng/Để êm/Xóa), danh sách user (chi tiết từng người, xóa cascade), stream thông báo toàn hệ
thống (lọc sentiment), quota Gemini 7 ngày + lịch sử cron, gửi push test.

### 7b. Trang test (`/admin-test`)
Công cụ kiểm thử nhanh, tách khỏi trang quản trị:
1. **Dự đoán thứ tự quét** (dry-run, 0 quota) — rule nào tới hạn + thứ tự sẽ quét.
2. **Chạy cron thử ngay** (tốn quota) — quét thật như cron, hiện kết quả (tin thật/fallback/bỏ qua
   mỗi rule, có nhãn dễ đọc).
3. **Chạy thử 1 rule** (tốn quota, có TẠO thông báo thật).
4. **🔽 Soi bộ lọc rác (gateCheck)** — lấy 1 tin thật (qua đúng đường router: provider/RSS/search) rồi
   cho biết CẢ 2 chế độ thông báo (Đầy đủ vs Chỉ tin quan trọng) sẽ quyết định gì, **KHÔNG tạo thông
   báo nào** (không làm bẩn dữ liệu). Hiện rõ **nguồn đã dùng** (🌤 Open-Meteo / 🪙 CoinGecko /
   💱 er-api / 📰 RSS / 🔍 Gemini search) — cách nhanh nhất để biết 1 rule cụ thể đang đi đường nào.
5. Gửi push test cho chính admin; pill quota hôm nay.

---

## 8. Migration cần chạy để dùng đủ tính năng

| File | Bật tính năng | Trạng thái |
|---|---|---|
| `0015_rule_notify_mode.sql` | Chế độ "Chỉ tin quan trọng" per-rule | ✅ Đã chạy (2026-07-03) |
| `0016_rule_reminder.sql` | Nhắc hẹn (reminder) | ✅ Đã chạy (2026-07-02) — nhắc hẹn hoạt động đủ |
| `0017_reminder_tick.sql` | Nhắc hẹn chính xác tới PHÚT (cron phụ mỗi phút, SQL-gated) | ✅ Đã chạy (2026-07-03) — cần verify key service_role đúng (lần trước dán nhầm anon → 401): thử "nhắc tôi 3 phút nữa" |
| `0018_url_watch.sql` | Theo dõi trang web cụ thể theo URL (mục 3g) + cấp quyền đăng nhập | ✅ Đã chạy (2026-07-03) |

→ Mọi migration đã chạy đủ. Tính năng mới chỉ còn phụ thuộc bản web/OTA mới nhất được deploy.

---

## 9. Backlog tính năng theo dõi (chưa làm)

- **Digest buổi sáng:** gộp nhiều rule thành 1 push tổng hợp thay vì push lẻ từng rule.
- ~~Theo dõi URL cụ thể~~ → ✅ ĐÃ LÀM (mục 3g, 2026-07-03).
- **Giá sản phẩm sàn TMĐT** (Shopee/Tiki...): chặn bot mạnh + ToS — rule url (3g) có thể thử nhưng
  không đảm bảo (trang render bằng JS thì fetch không thấy nội dung); chưa làm provider riêng.
- **Trang render thuần JavaScript (SPA):** fetch chỉ lấy HTML tĩnh, không chạy JS — trang kiểu này
  rule url sẽ báo "không có thông tin". Cần headless browser (nặng, chưa làm).
- **Giá vàng SJC bằng provider riêng:** hiện vẫn đi RSS/search vì chưa có API free đủ tin cậy.

Chi tiết kế hoạch/thứ tự ưu tiên các mục trên: xem mục "KẾ HOẠCH: Các loại theo dõi tiếp theo" trong
[KE_HOACH.md](KE_HOACH.md).
