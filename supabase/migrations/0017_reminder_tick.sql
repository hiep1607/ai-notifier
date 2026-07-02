-- NHẮC HẸN CHÍNH XÁC TỚI PHÚT (bỏ phụ thuộc cron 15 phút).
--
-- Vấn đề: cron chính chạy 15'/lần → "nhắc tôi 5 phút nữa" có thể trễ tới 15 phút.
-- Giải pháp: cron phụ 'reminder-tick' chạy MỖI PHÚT nhưng CỰC RẺ — chỉ là 1 câu SQL
-- kiểm tra "có nhắc hẹn nào tới hạn chưa bắn không"; KHÔNG có thì thôi (0 gọi mạng,
-- 0 tốn tài nguyên đáng kể), CÓ mới gọi run-monitor để bắn ngay trong phút đó.
--
-- CHẠY TRONG: Supabase Dashboard → SQL Editor. TRƯỚC KHI CHẠY thay 2 chỗ:
--   <PROJECT_REF>      : vd "idtibfiyfywcugdvlqal"
--   <SERVICE_ROLE_KEY> : legacy service_role JWT (dạng eyJ..., ở Settings → API Keys →
--                        Legacy API keys — KHÔNG phải sb_secret_..., xem lại lỗi cron cũ)

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Gỡ job cũ nếu chạy lại file này.
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
      'Authorization', 'Bearer ***JWT-DA-XOA-KHOI-LICH-SU***'
    ),
    -- reminderOnly: tick CHỈ xử lý nhắc hẹn, KHÔNG quét rule tin tức (tránh chạy chồng
    -- với cron chính 15' gây thông báo trùng + đỡ tốn quota).
    body    := '{"reminderOnly": true}'::jsonb,
    timeout_milliseconds := 60000
  )
  -- CHỈ gọi khi có nhắc hẹn đã/sắp tới hạn (30s tới) mà CHƯA bắn
  -- (điều kiện khớp isDue của reminder: chưa từng quét sau mốc hẹn).
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

-- Kiểm tra job:  select * from cron.job where jobname = 'reminder-tick';
-- Xem kết quả:   select status_code, content, created from net._http_response order by created desc limit 5;
