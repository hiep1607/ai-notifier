-- TICK MỖI PHÚT XỬ LÝ CẢ RULE GHIM GIỜ (bản tin 8:00 nổ đúng 8:00 ±1', hết lệch 0-15').
--
-- Vì sao: cron chính chạy 15'/lần nên rule ghim giờ (run_at) nổ lệch theo nhịp cron,
-- cộng hàng đợi dài (deadline 70s) có hôm lệch cả chục phút. Cron 'reminder-tick' (0017)
-- vốn đã chạy mỗi phút cho nhắc hẹn — mở rộng thành TICK chung: nhắc hẹn + rule ghim giờ
-- vừa tới mốc. Body đổi {"reminderOnly":true} → {"tick":true} (run-monitor nhận cả hai).
-- Chống bắn trùng khi tick chạy chồng cron chính: run-monitor đã có CLAIM nguyên tử
-- (UPDATE có điều kiện trên last_run_at) — SQL này chỉ là gác cổng rẻ.
--
-- CÁCH CHẠY (Supabase Dashboard → SQL Editor):
-- 1) Lấy key: Settings → API Keys → Legacy API keys → copy **service_role** JWT
--    (dạng eyJ..., payload có "role":"service_role" — KHÔNG phải anon, không phải
--    sb_secret_... — xem lại sự cố 0019).
-- 2) Thay <SERVICE_ROLE_KEY> bên dưới bằng key đó. KHÔNG commit key vào git.
-- 3) Run. Verify bằng query cuối file.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Gỡ job cũ (tên giữ nguyên 'reminder-tick' để khỏi mồ côi job).
select cron.unschedule('reminder-tick')
where exists (select 1 from cron.job where jobname = 'reminder-tick');

select cron.schedule(
  'reminder-tick',
  '* * * * *',  -- mỗi phút
  $$
  select net.http_post(
    url     := 'https://idtibfiyfywcugdvlqal.supabase.co/functions/v1/run-monitor',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
    ),
    -- tick: run-monitor CHỈ xử lý nhắc hẹn + rule ghim giờ vừa tới mốc (isTickDue),
    -- KHÔNG đụng rule định kỳ/điều kiện (tránh chạy chồng cron chính + đỡ tốn quota).
    body    := '{"tick": true}'::jsonb,
    timeout_milliseconds := 60000
  )
  where
    -- Nhắc hẹn đã/sắp tới hạn (30s tới) mà chưa bắn (giữ nguyên điều kiện 0017).
    exists (
      select 1 from rules
      where is_active
        and source_type = 'reminder'
        and remind_at is not null
        and remind_at <= now() + interval '30 seconds'
        and (last_run_at is null or last_run_at < remind_at)
    )
    -- HOẶC rule GHIM GIỜ trong cửa sổ 10' sau mốc hẹn (giờ VN) và có vẻ chưa quét mốc
    -- này. Gác cổng THÔ cho rẻ — quyết định cuối cùng là isTickDue + claim ở run-monitor.
    or exists (
      select 1 from rules
      where is_active
        and run_at ~ '^\d{1,2}:\d{2}$'
        and (frequency is null or frequency <> 'change')
        and mod(
              (extract(hour   from (now() at time zone 'Asia/Ho_Chi_Minh'))::int * 60
             + extract(minute from (now() at time zone 'Asia/Ho_Chi_Minh'))::int)
             - (split_part(run_at, ':', 1)::int * 60 + split_part(run_at, ':', 2)::int)
             + 1440, 1440) < 10
        and (last_run_at is null or last_run_at < now() - interval '10 minutes')
    );
  $$
);

-- ============ VERIFY ============
-- Job tồn tại với schedule mỗi phút:
--   select jobname, schedule from cron.job where jobname = 'reminder-tick';
-- Tạo 1 rule ghim giờ ở phút kế tiếp rồi xem lượt gọi (phải 200, trigger='tick'):
--   select status_code, left(content::text, 120), created
--   from net._http_response order by created desc limit 5;
--   select trigger, rules_scanned, inserted, created_at from cron_runs order by created_at desc limit 5;
