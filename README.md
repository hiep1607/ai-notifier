# AI Notifier

Ứng dụng (web + mobile) cho phép **mô tả bằng ngôn ngữ tự nhiên những gì muốn theo dõi** → AI (Gemini) tạo **rule** → hệ thống **tự quét tin thật từ nhiều nguồn 24/7** → gửi **thông báo** đúng chủ đề/điều kiện, kèm link bài gốc.

> Ví dụ: gõ *"mỗi sáng 7h báo giá vàng và bitcoin"* → app tạo 2 rule, mỗi ngày 7h sáng tự tìm tin mới nhất và gửi thông báo.

---

## Kiến trúc

```
App Expo (web + mobile)
   │  invoke (kèm JWT đăng nhập)
   ▼
Supabase Edge Functions ──► Gemini API (Google Search grounding)
   ├─ generate-rule : ngôn ngữ tự nhiên → Rule (hỏi lại khi thiếu, tách nhiều rule từ 1 câu)
   └─ run-monitor   : tìm tin thật → lọc điều kiện → insert notifications → gửi push
   ▲
pg_cron (mỗi 15 phút, gọi bằng service_role) → run-monitor (quét nền 24/7, lọc rule tới hạn)
```

- **Frontend:** Expo SDK 54 + Expo Router 6 (web `output: "single"`), React Context (Auth + Theme).
- **Backend:** Supabase — Postgres + RLS, Edge Functions (Deno), pg_cron + pg_net.
- **AI:** Gemini `gemini-2.5-flash` với Google Search grounding, chạy **server-side** (key trong Supabase secret, KHÔNG nằm trong app).
- Chạy nền 24/7: không cần bật PC hay mở app — cron tự quét và tạo thông báo.

---

## Chạy local

```bash
npm install
npx expo start          # mở web (localhost:8081) hoặc quét QR bằng Expo Go
```

Cần file `.env` (đã gitignore):

```
EXPO_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

> Anon key là **khóa công khai** (nhúng vào bản build, ai cũng thấy) — an toàn dữ liệu KHÔNG dựa vào việc giấu nó mà dựa vào **RLS + xác thực JWT**.

Thiết lập phần server (Gemini secret, deploy function, bật cron): xem [supabase/SETUP_GEMINI.md](supabase/SETUP_GEMINI.md).

---

## Tài liệu

| File | Nội dung |
|------|----------|
| [KE_HOACH.md](KE_HOACH.md) | Kế hoạch, tiến độ, backlog, **nhật ký + các lỗi đã gặp & cách giải quyết** |
| [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) | Phân tích kiến trúc & trạng thái phát triển |
| [supabase/SETUP_GEMINI.md](supabase/SETUP_GEMINI.md) | Các bước thủ công bật pipeline Gemini + cron |

---

## Bảo mật (quan trọng)

- `.env` **không commit** — chứa Supabase URL + anon key.
- `GEMINI_API_KEY` chỉ nằm trong **Supabase secret** (server-side), không bao giờ trong bundle client.
- `run-monitor` xác thực JWT người gọi, người dùng chỉ quét được rule của mình; chỉ cron (service_role) mới quét toàn hệ thống.
