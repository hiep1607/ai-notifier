-- Sức khỏe hệ thống (2026-07-03) — 2 phần:
--   (1) Cột rules.last_error: lỗi lần quét gần nhất của TỪNG rule (client hiện "⚠️ lỗi..."
--       ở chi tiết rule; quét thành công thì xóa). run-monitor ghi.
--   (2) WATCHDOG: cron THUẦN SQL mỗi 15 phút soi bảng cron_runs — nếu quét nền NGỪNG chạy
--       quá 50 phút (vd key cron sai → 401 như sự cố 2026-07-03) thì đẩy push thẳng cho
--       admin qua Expo Push API. KHÔNG đi qua Edge Function nên chính nó không chết theo.
--
-- CHẠY TRONG: Supabase Dashboard → SQL Editor → Run. KHÔNG cần thay key gì cả.

-- ===== (1) Lỗi lần quét gần nhất của từng rule =====
alter table rules add column if not exists last_error text;

-- ===== (2) Watchdog =====
-- Bảng ghi lần cảnh báo (để không spam: tối đa 1 cảnh báo / 6 giờ).
create table if not exists watchdog_alerts (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  reason text
);
alter table watchdog_alerts enable row level security; -- không policy: chỉ hệ thống đọc/ghi

select cron.unschedule('watchdog')
where exists (select 1 from cron.job where jobname = 'watchdog');

-- Điều kiện báo: (a) hệ thống ĐÃ TỪNG chạy (tránh báo oan lúc mới cài), (b) không có lượt
-- quét nền (trigger='cron') nào trong 50 phút (lịch 15'/lần → tức đã lỡ ≥3 lượt liên tiếp),
-- (c) chưa cảnh báo trong 6 giờ qua. Đủ cả 3 → ghi watchdog_alerts + push cho admin.
select cron.schedule(
  'watchdog',
  '*/15 * * * *',
  $$
  with dead as (
    select 1
    where exists (select 1 from cron_runs where trigger = 'cron')
      and not exists (
        select 1 from cron_runs
        where trigger = 'cron' and created_at > now() - interval '50 minutes'
      )
      and not exists (
        select 1 from watchdog_alerts
        where created_at > now() - interval '6 hours'
      )
  ),
  ins as (
    insert into watchdog_alerts (reason)
    select 'Không có lượt quét nền nào trong 50 phút.' from dead
    returning 1
  )
  select net.http_post(
    url     := 'https://exp.host/--/api/v2/push/send',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body    := (
      select jsonb_agg(jsonb_build_object(
        'to', pt.token,
        'title', '🚨 Hệ thống quét nền NGỪNG chạy',
        'body', 'Không có lượt quét nào trong 50 phút qua. Soi net._http_response: 401 = key cron sai (chạy lại 0019); không có dòng nào = pg_cron/pg_net trục trặc.',
        'sound', 'default'
      ))
      from push_tokens pt
      where pt.user_id in (
        select id from auth.users where lower(email) = 'tonghiep1607@gmail.com'
      )
    )
  )
  from ins
  where exists (
    select 1 from push_tokens
    where user_id in (select id from auth.users where lower(email) = 'tonghiep1607@gmail.com')
  );
  $$
);

-- Kiểm tra: select jobname, schedule from cron.job;  → phải thấy 'watchdog'.
-- Thử nghiệm khô (xem điều kiện, không bắn): chạy phần "with dead as (...) select * from dead".
