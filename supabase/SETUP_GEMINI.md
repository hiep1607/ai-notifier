# Bật pipeline Gemini server-side (24/7) — các bước thủ công

App dùng 4 Edge Function (`generate-rule`, `run-monitor`, `transcribe`, `admin-api`) trên Supabase.
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
# email được vào trang quản trị/quota:
supabase secrets set ADMIN_EMAILS="a@x.com,b@y.com"
```
> `SUPABASE_URL` và `SUPABASE_SERVICE_ROLE_KEY` đã có sẵn trong Edge Function runtime, không cần set.

## 3. Áp migration và deploy functions

Từ root project, sau khi `supabase link`:

```bash
npm run db:push      # áp migration còn thiếu theo thứ tự 0001 → mới nhất
npm run fn:deploy    # typecheck Deno → deploy 4 functions → boot-probe
```

Script deploy không hardcode project ref: ưu tiên `SUPABASE_PROJECT_REF`, nếu không thì dùng project ref trong `supabase/.temp/project-ref` do `supabase link` tạo.

## 4. Bật cron quét nền (24/7)
Migration `0027_portable_cron.sql` dựng các job bằng secret trong Vault; `0033` sửa tick rule ghim giờ. Project hiện hữu tự chuyển secret từ job cũ. Với project mới, tạo một lần ba secret sau trong SQL Editor rồi chạy `npm run db:push`:

```sql
select vault.create_secret('https://<PROJECT_REF>.supabase.co', 'ai_notifier_project_url');
select vault.create_secret('<SERVICE_ROLE_KEY>', 'ai_notifier_service_role_key');
select vault.create_secret('<ADMIN_EMAIL>', 'ai_notifier_watchdog_email');
```

## 5. Kiểm tra
- App → tạo rule mới (chat AI vẫn chạy, giờ qua Gemini).
- Rule detail → "Kiểm tra tin ngay" → phải ra thông báo tin thật kèm link.
- Nền: `select * from cron.job_run_details order by start_time desc limit 5;`
- Job: phải có `run-monitor`, `reminder-tick`, `watchdog`; command không được chứa URL/key thô.

---

## Ghi chú / giới hạn hiện tại
- **Bảo mật key**: đã an toàn (server-side secret). Free tier AI Studio đủ cho dùng cá nhân;
  để ý quota grounding nếu nhiều rule × tần suất dày (chỉnh lịch cron ở bước 4).
- **Push notification**: đã có code — `expo-notifications` đăng ký token vào bảng `push_tokens`,
  run-monitor gửi Expo Push khi tạo thông báo. Để nhận push lúc app đóng trên ĐIỆN THOẠI cần
  **EAS dev/standalone build** (Expo Go SDK 54 & web không nhận remote push).
- **Phân quyền run-monitor**: ĐÃ vá. Cron gọi bằng `service_role` (admin, quét tất cả); app gọi
  kèm JWT đăng nhập → function xác thực token, lấy `userId` TỪ token (bỏ qua `userId` trong body),
  chỉ quét rule của chính người đó; `ruleId` người khác → 403, chỉ có anon key → 401.
  Anon key là CÔNG KHAI (nằm trong mọi bản app) nên không được tin — bảo mật dựa vào RLS + JWT.
- `lib/news.ts` (RSS + Ollama cũ) đã xoá; logic quét chuyển hẳn server-side.
