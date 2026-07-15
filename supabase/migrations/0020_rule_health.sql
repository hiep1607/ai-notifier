-- Sức khỏe từng rule + bảng chống spam cảnh báo watchdog.
-- Job watchdog portable được tạo tại 0027_portable_cron.sql.
alter table rules add column if not exists last_error text;

create table if not exists watchdog_alerts (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  reason text
);
alter table watchdog_alerts enable row level security;
