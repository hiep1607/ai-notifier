-- Lịch sử chạy theo từng rule: giúp người dùng biết rule đã quét gì và vì sao không báo.
create table if not exists public.rule_scan_logs (
  id bigint generated always as identity primary key,
  rule_id uuid not null references public.rules(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  trigger text not null default 'cron'
    check (trigger in ('cron', 'tick', 'manual', 'user')),
  status text not null
    check (status in ('sent', 'filtered', 'no_change', 'related', 'no_result', 'error', 'quota')),
  reason text not null default '',
  candidate_title text not null default '',
  notification_count integer not null default 0 check (notification_count >= 0),
  started_at timestamptz not null default now(),
  finished_at timestamptz not null default now(),
  duration_ms integer not null default 0 check (duration_ms >= 0)
);

create index if not exists rule_scan_logs_rule_started_idx
  on public.rule_scan_logs(rule_id, started_at desc);
create index if not exists rule_scan_logs_user_started_idx
  on public.rule_scan_logs(user_id, started_at desc);

alter table public.rule_scan_logs enable row level security;

drop policy if exists "rule_scan_logs_select" on public.rule_scan_logs;
create policy "rule_scan_logs_select" on public.rule_scan_logs
  for select using (auth.uid() = user_id);

-- Client không được tự tạo/sửa lịch sử. Edge Function dùng service_role nên bypass RLS.
revoke insert, update, delete on public.rule_scan_logs from authenticated, anon;
grant select on public.rule_scan_logs to authenticated;
