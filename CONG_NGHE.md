# CÔNG NGHỆ & THIẾT KẾ — AI Notifier

> File này trả lời 3 câu hỏi: **dùng công nghệ gì và VÌ SAO chọn**, **app hoạt động ra sao và vì sao thiết kế vậy**, **từng chức năng giải quyết bằng cách nào**.
> Chi tiết cách dùng từng tính năng: [TINH_NANG.md](TINH_NANG.md) · Tiến độ/nhật ký: [KE_HOACH.md](KE_HOACH.md).

---

## 1. Các công nghệ lớn và lý do chọn

### 1a. React Native + Expo (SDK 54, Expo Router 6) — frontend
**Là gì:** viết 1 codebase JavaScript/TypeScript chạy được cả Android, iOS lẫn Web (react-native-web).

**Vì sao chọn:**
- **1 code — 3 nền tảng**: app này cần chạy cả web (dev/test nhanh trên trình duyệt) lẫn mobile (nhận push thật). Viết native riêng từng nền tảng hoặc Flutter đều tốn gấp đôi công cho một người làm.
- **Expo Go**: thử trên điện thoại thật bằng cách quét QR, không cần cài Android Studio/Xcode, không cần build APK mỗi lần sửa.
- **EAS Update (OTA)**: sửa code JS xong `eas update` là app trên máy người dùng tự nhận bản mới khi mở lại — không phải phát hành lại APK/lên store.
- **Expo Router**: routing theo cấu trúc thư mục `app/` (file = màn hình), đỡ tự viết navigator.

**Cái giá phải trả (đã gặp thật):** web và native khác nhau ngầm — `Alert` không chạy trên web (phải viết `lib/dialog.ts` riêng), `expo-audio` import trên web làm sập bundle (phải tách file `.web.ts`/`.ts`), web export bắt buộc `output: "single"` (chế độ "static" crash SSR với AsyncStorage). Quy ước của dự án: **mọi thay đổi phải chạy đúng trên cả web lẫn Expo Go**.

### 1b. Supabase — toàn bộ backend
**Là gì:** dịch vụ "Postgres + mọi thứ xung quanh": Auth, database có RLS, Edge Functions (serverless Deno), pg_cron, secret storage.

**Vì sao chọn (thay vì tự dựng server Node/Express):**
- **Không phải nuôi server**: app cần quét tin 24/7 — nếu tự dựng phải thuê VPS, lo deploy, lo giám sát. Supabase free tier gánh đủ: Postgres làm nguồn sự thật, Edge Function chạy logic quét, pg_cron bấm giờ.
- **Auth + RLS liền khối**: đăng nhập, phiên, và "user chỉ thấy dữ liệu của mình" đều do Postgres RLS đảm bảo ở tầng database — client có bug cũng không đọc trộm được dữ liệu người khác.
- **Edge Functions giấu được key AI**: key Gemini nằm trong Supabase secret, không bao giờ xuất hiện trong app (app chỉ có anon key — vốn là khóa công khai theo thiết kế).

**Các mảnh Supabase đang dùng:**
| Mảnh | Vai trò trong app |
|---|---|
| Postgres + RLS | Bảng `rules`, `notifications`, `push_tokens`, `user_settings`, `usage_logs`, `cron_runs` |
| Auth | Đăng ký/đăng nhập email, JWT cho mọi lời gọi |
| Edge Functions | `generate-rule` (NL→rule), `run-monitor` (quét), `transcribe` (giọng nói), `admin-api` |
| pg_cron + pg_net | Bấm giờ gọi run-monitor: nhịp chính 15 phút + tick mỗi phút |
| Secrets | GEMINI_API_KEY, ADMIN_EMAILS |

### 1c. Google Gemini (server-side) — tầng AI
**Là gì:** mọi việc "hiểu ngôn ngữ" đều đi qua Gemini: đọc mô tả người dùng để dựng rule, tìm tin bằng Google Search grounding, đọc trang web trích thông tin, chấm điều kiện, chép lời giọng nói.

**Vì sao chọn (và vì sao BỎ Ollama):**
- Bản đầu dùng **Ollama chạy local** — bỏ vì: máy người dùng phải bật 24/7 mới quét nền được, không public ra ngoài được, model nhỏ chất lượng thấp. Chuyển sang Gemini server-side là bước ngoặt giúp app "sống" độc lập với máy dev.
- **Google Search grounding**: Gemini tự tìm tin THẬT trên web (có nguồn, có URL) thay vì bịa — đúng bản chất app "giám sát tin tức".
- **Free tier đủ dùng** cho quy mô hiện tại — nhưng quota là ràng buộc thiết kế lớn nhất của cả hệ thống (xem §3d).

**Bài học quota (2026-07):** Google siết free tier `gemini-2.5-flash-lite` còn ~20 lượt/ngày, quota tính **riêng từng model** → `_shared/gemini.ts` có `fallbackModels`: hết bucket model này tự nhảy sang model kế (quét nền đi lite→2.0-lite→2.0-flash→2.5-flash; tạo rule đi 2.5-flash trước vì hướng người dùng). `usage_logs` ghi lại từng call + model để màn Admin đếm theo bucket.

### 1d. pg_cron + pg_net — bộ lập lịch 24/7
**Vì sao chọn:** không cần máy nào bật cả — Postgres tự bấm giờ (`pg_cron`) rồi tự gọi HTTP (`pg_net`) vào run-monitor. 2 nhịp:
- **Cron chính mỗi 15 phút**: quét mọi rule tới hạn.
- **Tick mỗi phút** (cực rẻ — chỉ 1 câu SQL kiểm tra, CÓ việc mới gọi HTTP): để nhắc hẹn và rule ghim giờ nổ **đúng phút** thay vì lệch theo nhịp 15'.

**Bẫy đã gặp:** cron gọi Edge Function phải dùng **legacy service_role JWT** (dạng `eyJ...`), không phải key `sb_secret_...`; dán nhầm anon key là tick chết im lặng (401). Debug bằng `net._http_response`.

### 1e. Expo Push — thông báo đẩy
**Vì sao chọn:** một API duy nhất (`exp.host/--/api/v2/push/send`) lo cả FCM (Android) lẫn APNs (iOS), không phải tự tích hợp từng cái. run-monitor gửi push trực tiếp sau khi insert notification; token chết (gỡ app) tự bị dọn khi Expo trả `DeviceNotRegistered`.

### 1f. Provider dữ liệu MIỄN PHÍ, 0 quota AI — cho số liệu
**Vì sao có tầng này:** gọi Gemini cho câu hỏi "hôm nay bao nhiêu độ" vừa tốn quota vừa dễ sai. Số liệu lấy từ API chuyên dụng — **số thật, nhanh, free, không cần key**:
| Nguồn | Dùng cho |
|---|---|
| Open-Meteo | Thời tiết (nhiệt độ, mưa, gió theo địa danh) |
| CoinGecko | Giá coin (BTC, ETH, SOL...) |
| open.er-api.com | Tỷ giá USD/VND |
| RSS báo VN (VnExpress, Tuổi Trẻ, CafeF...) | Tin tức theo chuyên mục — link bài LUÔN thật |

### 1g. TypeScript + Jest (jest-expo) — chất lượng code
- **TypeScript** toàn bộ client + Edge Functions.
- **Jest 140 test / 11 suite**: logic thuần của server (lịch quét, chống trùng, chọn tin) được tách vào `_shared/monitorLogic.ts` **không import Deno API** — để jest (Node) test được đúng code chạy thật trên server.
- **Bẫy đã gặp:** tsc/jest KHÔNG phủ code Deno → có lỗi cú pháp vẫn "deploy thành công" nhưng function sập lúc boot. Giải pháp: `scripts/deploy-functions.mjs` gộp deploy + **probe** (gọi thử từng function bằng body rẻ, khẳng định boot OK) làm một bước.

---

## 2. App hoạt động thế nào (và vì sao thiết kế vậy)

```
Người dùng mô tả bằng lời ("mỗi sáng 8h báo dự án hot trên GitHub")
        │
        ▼
[generate-rule]  Gemini đọc hội thoại → JSON rule (keyword, tần suất, giờ, điều kiện,
                 URL theo dõi...) — thiếu thông tin thì HỎI LẠI, vô lý thì từ chối khéo
        │ insert
        ▼
[Postgres: rules] ◄─── pg_cron 15' + tick 1' gọi ───► [run-monitor]
                                                          │
                       ┌──────────── ROUTER NGUỒN ────────┤ (chọn đường RẺ nhất trước)
                       │ 1. Nhắc hẹn        → 0 AI, chỉ lịch + push
                       │ 2. Thời tiết/coin/tỷ giá → API thật, 0 quota
                       │ 3. URL cụ thể      → fetch trang → ưu tiên FEED → AI đọc text
                       │ 4. Tin tức         → RSS báo VN + AI chọn bài (không grounding)
                       │ 5. Còn lại         → Gemini + Google Search grounding (đắt nhất)
                       └──────────────────────────────────┤
                                                          ▼
                       CỔNG LỌC: điều kiện thỏa? số liệu đổi? trùng bài đã gửi?
                       đúng giờ hẹn? chế độ "chỉ tin quan trọng"? giờ yên lặng?
                                                          │ vượt cổng
                                                          ▼
                       insert [notifications] + Expo Push → điện thoại người dùng
```

**Các quyết định thiết kế chính và lý do:**

1. **Cron là bộ lập lịch DUY NHẤT** — app mở lên chỉ ĐỌC tin, không tự quét (trừ kéo-refresh có throttle 5'). Lý do: 2 nơi cùng quét = thông báo trùng + đốt quota gấp đôi.
2. **Lịch tính per-rule bằng `last_run_at` + tần suất** (hàm `isDue`), không phải "cron chạy là quét hết". Lý do: rule 1 tiếng chỉ được tốn tối đa 24 call/ngày — quota gate tự nhiên.
3. **Router nguồn: rẻ trước, đắt sau.** Grounding là phương án CUỐI. Lý do: quota 1 ngày có hạn, còn API thời tiết/giá thì free vô hạn — dồn AI cho đúng việc cần AI.
4. **Server làm hết việc nặng, client chỉ hiển thị.** Client không có key AI, không quyết định gì về lịch. Lý do: bảo mật (key không lộ) + nhất quán (1 nguồn logic duy nhất, trang test cũng gọi server dry-run thay vì tính lại ở client).
5. **Mọi thứ best-effort, không chết chùm**: bảng log chưa migrate → nuốt lỗi ghi tiếp phần còn lại; AI kẹt quota giữa lượt → rule 0-AI phía sau vẫn quét; enrich bài lỗi → giữ bản tóm tắt ngắn. Lý do: hệ chạy nền 24/7 không ai canh — một mắt xích hỏng không được kéo sập cả lượt quét.

---

## 3. Các chức năng và cách giải quyết

### 3a. Tạo rule bằng ngôn ngữ tự nhiên (chat + giọng nói)
- **Vấn đề:** người dùng nói mơ hồ ("theo dõi giá ETH") — thiếu tần suất, thiếu điều kiện.
- **Giải quyết:** generate-rule trả 2 trạng thái: `ready` (đủ thông tin → JSON rule đầy đủ) hoặc `need_info` (hỏi lại đúng 1 câu). Có "bản đồ nguồn": "dự án nổi bật GitHub mỗi sáng" tự dựng URL `github.com/trending`; yêu cầu bất khả thi (đọc Instagram) → giải thích + gợi ý thay thế. Giọng nói: web dùng Web Speech API (0 quota), mobile ghi âm → Edge Function `transcribe` (Gemini chép lời).

### 3b. Đúng giờ hẹn (`run_at`) — chính xác tới phút
- **Vấn đề:** cron 15' → bản tin 8:00 nổ lệch 0-15'; lượt 8:00 dính hết quota → mất nguyên ngày.
- **Giải quyết:** 3 lớp — (1) **tick mỗi phút** bắt mốc hẹn trong cửa sổ [mốc, +10'); (2) **catch-up 4 tiếng**: lỡ mốc (quota/lỗi) thì các lượt cron sau thử lại tới khi thành công ("bắn muộn còn hơn nuốt"); (3) **claim nguyên tử** (UPDATE có điều kiện trên `last_run_at`): tick và cron chính chạy chồng cũng chỉ 1 lượt được bắn — không đúp.

### 3c. Chống thông báo trùng / rác
- **Vấn đề:** Gemini hay trả lại đúng bài nổi nhất hôm qua; báo sửa tít nhẹ; trang trending giữ nguyên top nhiều ngày → user nhận hoài 1 tin.
- **Giải quyết:** nhiều lớp — dedup **tiêu đề chuẩn hóa + link chuẩn hóa** (bỏ utm_/fbclid, www, trailing slash); prompt kèm **danh sách bài đã gửi** bảo AI né (cả đường search lẫn đường đọc URL); rule đặt giờ mà nội dung y cũ → gửi **"Chưa có thay đổi mới"** trỏ về thông báo trước thay vì lặp nguyên văn; chế độ **"Chỉ báo tin quan trọng"** lọc filler; filler không push (chỉ xem trong app); **giờ yên lặng** chặn push theo khung giờ user đặt.

### 3d. Sống chung với quota AI ít ỏi
- **Vấn đề:** free tier flash-lite còn ~20 lượt/ngày; quota cạn là cả hệ tê liệt.
- **Giải quyết:** router nguồn rẻ-trước (§2); **fallback đa bucket model**; **hash-gate**: trang web y nguyên lần trước (vân tay FNV-1a) → 0 call AI; cache RSS theo category trong 1 lượt quét; `isAiFreeRule` — kẹt quota giữa lượt thì rule 0-AI vẫn chạy tiếp; `usage_logs` + màn Admin đếm theo model; push cảnh báo admin khi chạm ~80% trần.

### 3e. Theo dõi trang web bất kỳ theo URL (kể cả trang cần đăng nhập)
- **Vấn đề:** nguồn người dùng muốn theo dõi không có API; trang MXH chặn bot; trang cần login.
- **Giải quyết:** fetch trang → ưu tiên **feed trang tự khai báo** (RSS/Atom — link bài chuẩn, dedup ổn) → không có thì AI đọc text đã strip HTML + **chọn đúng link bài** từ danh sách anchor; `normalizeWatchUrl` quy đổi link quen tay sang link đọc được (t.me→/s/, reddit→.rss, YouTube channel→feed XML); trang đòi login (401/403 hoặc AI phát hiện) → thông báo 🔒 hướng dẫn dán Cookie, lưu ở `watch_auth`; **chặn SSRF** (cấm IP nội bộ/metadata) vì run-monitor chạy service_role.

### 3f. Nhắc hẹn ("nhắc tôi 10 phút nữa tắt máy giặt")
- **Giải quyết:** rule `source_type='reminder'` + `remind_at` (AI tự quy đổi giờ tương đối từ thời điểm hiện tại) — 0 AI khi bắn, tick mỗi phút đảm bảo đúng phút, bắn xong tự tắt và gom vào mục "Nhắc hẹn đã xong".

### 3g. Mở app nhanh, chuyển tab mượt
- **Vấn đề:** mở app trắng màn chờ mạng; chuyển tab lần đầu đứng vài giây.
- **Giải quyết:** giữ splash tới khi auth sẵn sàng; **prefetch** dữ liệu MỌI tab ngay khi có session vào **cache 2 tầng RAM + AsyncStorage** (`lib/prefetch.ts`, `lib/screenCache.ts`) — màn nào mở cũng vẽ được ngay khung hình đầu, mạng về sau thay bản mới (stale-while-revalidate); danh sách dài **ảo hóa bằng FlatList** (chỉ vẽ ~10 dòng quanh khung nhìn thay vì 100 card Swipeable một lượt).

### 3h. Bảo mật & phân quyền
- **Giải quyết:** RLS trên mọi bảng dữ liệu người dùng; run-monitor phân biệt **service_role (cron, quét tất cả)** với **JWT user (chỉ quét rule của chính mình — userId lấy TỪ token, không tin body)**; key AI chỉ nằm server; anon key là khóa công khai đúng thiết kế; admin nhận diện qua `ADMIN_EMAILS` secret.

### 3i. Vận hành & tự giám sát
- **Giải quyết:** `cron_runs` ghi từng lượt quét (bao nhiêu rule, mấy tin, có kẹt quota, chạy bao lâu); `rules.last_error` + watchdog SQL push admin khi quét nền chết >50'; deploy function nào cũng **probe boot** ngay (`npm run fn:deploy`); thứ tự deploy web/OTA cố định (eas update → expo export web → eas deploy) tránh web 404; ngân sách 70s/lượt quét + ưu tiên tầng (nhắc hẹn → ghim giờ → định kỳ) để deadline không nuốt bản tin đúng hẹn.

---

## 4. Những lựa chọn đã CÂN NHẮC RỒI BỎ (để khỏi bàn lại)
| Phương án | Vì sao bỏ |
|---|---|
| Ollama chạy local | Máy phải bật 24/7, không public được, model yếu |
| Theo dõi Facebook/Instagram/TikTok/X | FB trả trang rỗng cho bot; X bắt trả phí API — từ chối khéo + gợi ý nguồn thay thế |
| Digest bản tin sáng (gộp nhiều rule) | User chốt "không cần lắm" — backlog |
| Quét ở client khi mở app | Trùng với cron, đốt quota gấp đôi — client chỉ đọc |
| Cap cứng số rule mỗi lượt quét | `isDue` per-rule đã là quota gate tự nhiên; cap cứng làm rule trễ oan |
