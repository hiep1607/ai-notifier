-- Phase 2C — Chạy giám sát NỀN 24/7 bằng pg_cron + pg_net (không cần PC bật, không cần mở app).
-- Cron gọi Edge Function run-monitor theo lịch; function dùng Gemini tìm tin thật rồi insert.
--
-- CHẠY TRONG: Supabase Dashboard → SQL Editor → New query → Run.
-- TRƯỚC KHI CHẠY, thay 2 chỗ <PROJECT_REF> và <SERVICE_ROLE_KEY>:
--   <PROJECT_REF>      : phần đầu URL project, vd "idtibfiyfywcugdvlqal"
--   <SERVICE_ROLE_KEY> : Settings → API → service_role key (BÍ MẬT, chỉ nằm trong DB)

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Gỡ job cũ nếu chạy lại file này (tránh trùng lịch).
select cron.unschedule('run-monitor')
where exists (select 1 from cron.job where jobname = 'run-monitor');

-- Mỗi giờ quét MỌI rule active. Đổi '0 * * * *' nếu muốn dày/thưa hơn
-- (vd '*/30 * * * *' = mỗi 30 phút). Cân nhắc quota Gemini.
select cron.schedule(
  'run-monitor',
  '0 * * * *',
  $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/run-monitor',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

-- Kiểm tra: select * from cron.job;
-- Xem log:  select * from cron.job_run_details order by start_time desc limit 10;
