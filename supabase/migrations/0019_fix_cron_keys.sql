-- SỬA CẢ 2 CRON VỀ ĐÚNG KEY (2026-07-03).
--
-- Vì sao có file này: khi "chạy lại mọi migration", 0004 bị chạy với placeholder
-- <SERVICE_ROLE_KEY> nguyên văn và 0017 bị chạy với ANON key ("role":"anon") →
-- run-monitor trả 401 → CRON NỀN CHẾT IM: rule thời tiết/tin tức không quét nữa
-- (chỉ "Kiểm tra tin ngay" thủ công còn chạy). File này lập lại CẢ HAI job đúng key.
--
-- CÁCH CHẠY (Supabase Dashboard → SQL Editor):
-- 1) Lấy key: Settings → API Keys → Legacy API keys → copy **service_role** JWT
--    (dạng eyJ..., payload có "role":"service_role" — TUYỆT ĐỐI không phải anon,
--    không phải sb_secret_...).
-- 2) Thay MỘT chỗ duy nhất bên dưới: đổi cả 2 chuỗi <SERVICE_ROLE_KEY> thành key đó
--    (Ctrl+H thay tất cả). KHÔNG commit key vào git.
-- 3) Run. Rồi verify bằng 2 query cuối file.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ============ CRON CHÍNH: quét mọi rule tới hạn, mỗi 15 phút ============
select cron.unschedule('run-monitor')
where exists (select 1 from cron.job where jobname = 'run-monitor');

select cron.schedule(
  'run-monitor',
  '*/15 * * * *',
  $$
  select net.http_post(
    url     := 'https://idtibfiyfywcugdvlqal.supabase.co/functions/v1/run-monitor',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

-- ============ CRON PHỤ: nhắc hẹn chính xác tới phút (SQL-gated) ============
select cron.unschedule('reminder-tick')
where exists (select 1 from cron.job where jobname = 'reminder-tick');

select cron.schedule(
  'reminder-tick',
  '* * * * *',
  $$
  select net.http_post(
    url     := 'https://idtibfiyfywcugdvlqal.supabase.co/functions/v1/run-monitor',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
    ),
    body    := '{"reminderOnly": true}'::jsonb,
    timeout_milliseconds := 60000
  )
  where exists (
    select 1 from rules
    where is_active
      and source_type = 'reminder'
      and remind_at is not null
      and remind_at <= now() + interval '30 seconds'
      and (last_run_at is null or last_run_at < remind_at)
  );
  $$
);

-- ============ VERIFY (chạy sau ~16 phút) ============
-- 2 job phải tồn tại:
--   select jobname, schedule from cron.job where jobname in ('run-monitor','reminder-tick');
-- Lượt gọi gần nhất phải 200 (KHÔNG phải 401):
--   select status_code, left(content::text, 120), created
--   from net._http_response order by created desc limit 5;
