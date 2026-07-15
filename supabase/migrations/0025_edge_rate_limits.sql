-- Giới hạn gọi Edge Function theo user, thực hiện nguyên tử trong Postgres.
-- Chỉ service_role được gọi RPC; client không thể tự xóa/reset bộ đếm.

create table if not exists public.edge_rate_limits (
  bucket text not null,
  subject text not null,
  window_start timestamptz not null,
  request_count integer not null default 1 check (request_count > 0),
  primary key (bucket, subject, window_start)
);

create index if not exists idx_edge_rate_limits_window
  on public.edge_rate_limits (window_start);

alter table public.edge_rate_limits enable row level security;
revoke all on table public.edge_rate_limits from public, anon, authenticated;

create or replace function public.consume_edge_rate_limit(
  p_bucket text,
  p_subject text,
  p_limit integer,
  p_window_seconds integer
)
returns table (allowed boolean, retry_after_seconds integer, current_count integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_window_start timestamptz;
  v_count integer;
begin
  if p_bucket is null or length(p_bucket) not between 1 and 80
    or p_subject is null or length(p_subject) not between 1 and 128
    or p_limit not between 1 and 10000
    or p_window_seconds not between 10 and 86400 then
    raise exception 'invalid rate-limit parameters';
  end if;

  v_window_start := to_timestamp(
    floor(extract(epoch from v_now) / p_window_seconds) * p_window_seconds
  );

  insert into public.edge_rate_limits (bucket, subject, window_start, request_count)
  values (p_bucket, p_subject, v_window_start, 1)
  on conflict (bucket, subject, window_start)
  do update set request_count = public.edge_rate_limits.request_count + 1
  returning request_count into v_count;

  -- Dọn bucket cũ với xác suất thấp để bảng không tăng vô hạn mà không cần thêm cron.
  if random() < 0.02 then
    delete from public.edge_rate_limits where window_start < v_now - interval '2 days';
  end if;

  return query select
    v_count <= p_limit,
    greatest(1, ceil(extract(epoch from (v_window_start + make_interval(secs => p_window_seconds) - v_now)))::integer),
    v_count;
end;
$$;

revoke all on function public.consume_edge_rate_limit(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_edge_rate_limit(text, text, integer, integer) to service_role;
