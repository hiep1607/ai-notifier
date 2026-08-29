-- Tách mốc chạy lịch khỏi last_run_at.
-- last_run_at vẫn ghi mọi lượt quét (kể cả người dùng bấm "Kiểm tra tin ngay");
-- last_scheduled_at chỉ ghi khi cron/tick nhận một mốc ghim giờ. Nhờ vậy quét tay
-- trước giờ hẹn không làm bản tin tự động bị bỏ qua.

alter table public.rules
  add column if not exists last_scheduled_at timestamptz;

-- Chỉ backfill từ lịch sử có trigger cron/tick. Không copy last_run_at mù quáng vì giá
-- trị đó có thể vừa được một lượt MANUAL ghi trước giờ hẹn — chính là lỗi đang sửa.
update public.rules r
set last_scheduled_at = x.finished_at
from (
  select rule_id, max(finished_at) as finished_at
  from public.rule_scan_logs
  where trigger in ('cron', 'tick')
    and status not in ('error', 'quota')
  group by rule_id
) x
where r.id = x.rule_id
  and r.run_at is not null
  and btrim(r.run_at) <> ''
  and r.frequency <> 'change'
  and r.last_scheduled_at is null;

create index if not exists idx_rules_active_scheduled_due
  on public.rules (last_scheduled_at)
  where is_active and run_at is not null and btrim(run_at) <> '';
