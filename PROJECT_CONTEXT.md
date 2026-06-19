# PROJECT_CONTEXT.md — AI Notifier

> Phân tích kiến trúc & trạng thái phát triển (cập nhật 2026-06-19)
> Theo dõi tiến độ/backlog chi tiết ở [KE_HOACH.md](KE_HOACH.md).

---

## 1. Tổng quan

**AI Notifier** là ứng dụng mobile/web cho phép người dùng mô tả bằng ngôn ngữ tự nhiên những gì muốn theo dõi. AI (Gemini) chuyển mô tả đó thành "rule", rồi hệ thống tự quét tin THẬT nhiều nguồn 24/7 và gửi thông báo đúng chủ đề/điều kiện kèm link bài gốc.

**Stack:** React Native + Expo Router + Supabase (Postgres + Edge Functions + pg_cron) + Google Gemini (server-side).

**Nền tảng hỗ trợ:** Web (browser) + Mobile (Expo Go) — mọi thay đổi phải tương thích cả hai.

---

## 2. Kiến trúc phân tầng

```
┌──────────────────────────────────────────────┐
│             FRONTEND (React Native)           │
│   Expo Router · React Context · RN Web        │
├──────────────────────────────────────────────┤
│             BACKEND (Supabase)                │
│   Auth · Postgres + RLS · Edge Functions      │
│   pg_cron + pg_net (quét nền 24/7)            │
├──────────────────────────────────────────────┤
│                AI LAYER                       │
│  Gemini 2.5 Flash + Google Search grounding   │
│  (server-side, key trong Supabase secret)     │
└──────────────────────────────────────────────┘
```

### 2a. Frontend
- **Framework:** Expo SDK 54 + Expo Router 6 (file-based routing); web `output: "single"` (BẮT BUỘC — "static" crash SSR với AsyncStorage).
- **Platform:** Web (dev `localhost:8081`) + Mobile (Expo Go qua QR).
- **State:** React Context — `AuthContext` (session Supabase) + `ThemeContext` (dark/light, persist AsyncStorage).
- **Style:** `useMemo(() => createStyles(colors), [colors])` — StyleSheet động theo theme.
- **Dialog:** `lib/dialog.ts` — `alertMessage()` / `confirmAsync()` web-safe (không dùng `Alert` native).

### 2b. Database (Supabase Postgres + RLS)
| Bảng | Mục đích |
|------|----------|
| `rules` | Rule theo dõi của user |
| `notifications` | Thông báo do hệ thống sinh ra |
| `push_tokens` | Expo push token theo thiết bị/user |
| `auth.users` | Supabase built-in auth |

**rules:** `id, user_id, title, description, keyword, category, sources, frequency, run_at, condition, is_active, last_run_at, last_value, created_at`
- `frequency`: `"change"` (theo điều kiện, quét mỗi 15') HOẶC số phút (định kỳ, tối thiểu 30).
- `run_at`: giờ báo "HH:MM" (giờ VN) khi muốn ghim giờ cố định; "" nếu không.
- `last_run_at`: mốc quét gần nhất (để cron tính lịch per-rule).
- `last_value`: số liệu chính lần trước (trigger "thay đổi" — chỉ báo khi số liệu thực sự đổi).

**notifications:** `id, rule_id, title, content, details, ai_summary, source, source_url, category, sentiment, is_important, is_read, created_at`

**RLS:** đã bật cho `rules` + `notifications` — mỗi user chỉ đọc/ghi dữ liệu của mình.
Migrations: `supabase/migrations/0001`→`0008`.

### 2c. AI Layer — Gemini server-side
- **Edge Functions (Deno):**
  - `generate-rule`: hội thoại → rule JSON. Hỏi lại khi thiếu thông tin, giải thích yêu cầu vô lý, **tách nhiều rule từ 1 câu** ("vàng và bitcoin" → 2 rule), trả về MẢNG `rules`.
  - `run-monitor`: tìm tin thật (Google Search grounding) → lọc điều kiện/thay đổi/chống trùng → insert notification → gửi Expo push.
- **Model:** `gemini-2.5-flash` (đổi qua secret `GEMINI_MODEL`). Grounding KHÔNG kết hợp được JSON `responseMimeType` → parse JSON "loose".
- **Key:** `GEMINI_API_KEY` trong Supabase secret (server-side), không bao giờ ở client.
- Ollama local (`lib/news.ts`) đã **gỡ bỏ hoàn toàn**.

### 2d. Quét nền 24/7
- `pg_cron` chạy **mỗi 15 phút** → `net.http_post` gọi `run-monitor` (kèm `service_role` key) với body `{}`.
- `run-monitor` tự lọc rule **tới hạn** (`isDue`) theo `frequency` + `run_at` + `last_run_at`; rule "change" quét sát 15', rule định kỳ giãn theo cài đặt, rule ghim giờ bắn trong khung [giờ hẹn, +15').
- Cron là **bộ lập lịch DUY NHẤT** — client không tự quét trùng (tiết kiệm quota); Home chỉ đọc tin, refresh thủ công throttle 5'.

### 2e. Auth & Phân quyền
- Supabase Email/Password; session persist qua AsyncStorage; chưa đăng nhập → `/login`.
- `run-monitor` phân biệt: **cron** (service_role → admin, quét tất cả) vs **người dùng** (JWT → chỉ rule của mình). Xem mục lỗi #7 bên dưới.

---

## 3. Lỗi đã gặp & cách giải quyết

> Các lỗi mang tính **hệ thống** (ảnh hưởng mọi rule), không phải sửa lẻ từng rule.

### #1 — Thông báo lặp / không bao giờ lặp với chủ đề kiểu số liệu
- **Triệu chứng:** rule thời tiết (URL trang ổn định) chỉ tạo được vài thông báo trong nhiều ngày.
- **Nguyên nhân:** chống trùng theo `source_url` toàn thời gian → cùng một URL bị chặn vĩnh viễn dù số liệu đã đổi.
- **Cách xử lý:** chống trùng theo **URL + `last_value`** — cùng URL nhưng số liệu đổi vẫn báo. Lưu `last_value` làm baseline (migration 0008), truyền vào Gemini để chấm `changed`. Khi CHƯA có baseline thì không tự nhận "đã đổi" (tránh báo lặp mỗi phiên).

### #2 — Rule bị "bỏ đói" khi có nhiều rule
- **Nguyên nhân:** query rule không sắp thứ tự + trần `MAX_RULES_PER_RUN = 8` → rule ở vị trí > 8 không bao giờ tới lượt.
- **Cách xử lý:** sắp theo `last_run_at` tăng dần (lâu chưa quét lên trước) → xoay vòng công bằng, rule ghim giờ không bị chen.

### #3 — Đốt quota Gemini (free tier)
- **Nguyên nhân:** client tự quét + cron quét → trùng lặp; lỗi 429 vẫn cố retry.
- **Cách xử lý:** cron là lịch duy nhất; client bỏ auto-scan; gặp 429/503 thì **dừng sớm** và giữ `last_run_at` để quét lại; trần 8 rule/lần; client chỉ retry lỗi tạm (không retry 429).

### #4 — Quét xong mà không có thông báo gì
- **Nguyên nhân:** không tìm thấy bài khớp → trả mảng rỗng → im lặng, người dùng tưởng hỏng.
- **Cách xử lý:** rule **định kỳ/đặt giờ LUÔN gửi** 1 thông báo: có tin mới → gửi tin; không có nhưng đã có tb trước → "chưa có thay đổi" + link trỏ về tb trước; chưa có tb nào → "chưa tìm thấy" + tin liên quan gần nhất. Rule **theo điều kiện** mới giữ im khi chưa thỏa.

### #5 — Rule ghim giờ không bắn đúng giờ
- **Cách xử lý:** rule có `run_at` bắn trong khung **[giờ hẹn, giờ hẹn + 15')** (đúng giờ, không sớm, trễ tối đa 15' do cron 15'/lần), có guard chu kỳ tránh bắn lặp trong ngày, xử lý cả mốc quanh nửa đêm.

### #6 — Rule mơ hồ (thiếu tần suất/điều kiện)
- **Cách xử lý:** xử lý ngay **lúc tạo rule** — `generate-rule` hỏi lại, không tự bịa condition; chỉ trả "ready" khi đủ keyword + category + (tần suất hợp lệ HOẶC điều kiện cụ thể).

### #7 — Ai có anon key cũng kích hoạt run-monitor cho user khác (đốt quota)
- **Hiểu lầm phổ biến:** "anon key của người khác". Thực ra anon key là **khóa CÔNG KHAI dùng chung**, nhúng trong mọi bản app — ai mở app/DevTools đều có. Bảo mật KHÔNG dựa vào giấu nó mà dựa vào **RLS**.
- **Lỗ hổng:** `run-monitor` chạy bằng `service_role` (bỏ qua RLS) và tin `userId` trong body → kẻ xấu gọi thẳng với `userId` người khác để quét rule họ / đốt quota.
- **Cách xử lý:** function phân biệt cron (service_role → admin) vs người dùng (JWT). Với người dùng: **xác thực JWT** (`auth.getUser`), lấy `userId` **TỪ token** (bỏ qua body), chỉ quét rule của mình; `ruleId` người khác → 403; chỉ có anon key → 401.

### Vặt — môi trường dev
- **PowerShell here-string `@'...'@` chứa dấu `"`** làm hỏng commit message → viết message không chèn dấu nháy kép.
- **`web.output: "static"`** crash SSR với AsyncStorage → phải để `"single"`.
- **Push khi app đóng trên điện thoại** cần EAS build (Expo Go SDK 54 & web không nhận remote push).

---

## 4. Chức năng hiện có

| Chức năng | Trạng thái |
|-----------|------------|
| Đăng nhập / đăng ký / hồ sơ (lỗi auth tiếng Việt) | ✅ web + mobile |
| Tạo rule bằng AI chat (Gemini) + tách nhiều rule từ 1 câu | ✅ |
| Tạo rule thủ công (form) | ✅ |
| Tần suất linh hoạt (số phút ≥30) + ghim giờ (run_at) + theo điều kiện | ✅ |
| Quét tin THẬT nhiều nguồn (Gemini + grounding) | ✅ deploy |
| Quét nền 24/7 (pg_cron 15') | ✅ |
| Thông báo chi tiết (content + details + ai_summary) + 1/lần | ✅ |
| Luôn-gửi cho rule định kỳ/đặt giờ (không im lặng) | ✅ |
| Trigger "thay đổi" (last_value) | ✅ |
| Dedup URL + value | ✅ |
| Phân quyền run-monitor theo JWT | ✅ |
| RLS rules + notifications | ✅ |
| Push notification (code: token + Expo push) | ✅ code (cần EAS build để nhận lúc app đóng) |
| Dark/light mode realtime + persist | ✅ |

---

## 5. Đang chờ người dùng / Backlog

**Chờ người dùng (tôi không tự làm được):**
- Đổi key Gemini (key cũ từng lộ trong ảnh chụp lúc setup).
- EAS init + dev build để nhận push thật trên điện thoại.

**Backlog:**
- Polish UI/UX: lọc/tìm thông báo, trạng thái rỗng, hiển thị điều kiện/lịch rõ hơn, ẩn nút "Đọc bài gốc" khi `source_url` rỗng (tb fallback).
