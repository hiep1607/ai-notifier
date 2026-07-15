-- Khóa idempotency do run-monitor tạo. Unique partial index biến bước insert thành
-- nguyên tử: hai invocation chạy chồng chỉ một bên chèn được notification.
alter table public.notifications add column if not exists dedup_key text;
create unique index if not exists uq_notifications_rule_dedup
  on public.notifications (rule_id, dedup_key)
  where rule_id is not null and dedup_key is not null;
