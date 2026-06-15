# Bật pipeline Gemini server-side (24/7) — các bước thủ công

App giờ gọi 2 Edge Function (`generate-rule`, `run-monitor`) chạy Gemini trên Supabase.
Key Gemini giấu trong Supabase secret, không lộ ra app. Cron quét nền 24/7.

Làm các bước sau (chỉ bạn làm được — cần đăng nhập / key bí mật):

## 1. Cài & link Supabase CLI
```bash
npm install -g supabase
supabase login
supabase link --project-ref <PROJECT_REF>   # vd idtibfiyfywcugdvlqal
```

## 2. Nạp key Gemini làm secret (KHÔNG hardcode, không commit)
```bash
supabase secrets set GEMINI_API_KEY=<key_AI_Studio_cua_ban>
# tuỳ chọn đổi model: supabase secrets set GEMINI_MODEL=gemini-2.5-flash
```
> `SUPABASE_URL` và `SUPABASE_SERVICE_ROLE_KEY` đã có sẵn trong Edge Function runtime, không cần set.

## 3. Deploy 2 function
```bash
supabase functions deploy generate-rule
supabase functions deploy run-monitor
```

## 4. Bật cron quét nền (24/7)
Mở **Supabase Dashboard → SQL Editor**, dán nội dung `migrations/0004_cron_run_monitor.sql`,
thay `<PROJECT_REF>` và `<SERVICE_ROLE_KEY>` (Settings → API), rồi Run.

## 5. Kiểm tra
- App → tạo rule mới (chat AI vẫn chạy, giờ qua Gemini).
- Rule detail → "Kiểm tra tin ngay" → phải ra thông báo tin thật kèm link.
- Nền: `select * from cron.job_run_details order by start_time desc limit 5;`

---

## Ghi chú / giới hạn hiện tại
- **Bảo mật key**: đã an toàn (server-side secret). Free tier AI Studio đủ cho dùng cá nhân;
  để ý quota grounding nếu nhiều rule × tần suất dày (chỉnh lịch cron ở bước 4).
- **Push notification** (báo khi không mở app) CHƯA làm — hiện thông báo lưu vào DB, thấy khi mở app.
  Bước tiếp theo: thêm `expo-notifications` + lưu push token + cho run-monitor gửi push.
- **Phân quyền**: run-monitor dùng service role nên ai đăng nhập cũng kích hoạt quét được;
  đủ cho app cá nhân, sau này nên giới hạn theo user trong JWT.
- `lib/news.ts` (RSS + Ollama cũ) đã xoá; logic quét chuyển hẳn server-side.
