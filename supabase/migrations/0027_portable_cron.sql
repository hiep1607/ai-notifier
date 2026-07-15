-- Cron portable: URL project, service_role key và email nhận watchdog nằm trong Vault,
-- không còn hardcode/placeholder trong migration hoặc cron.job.command.
-- Trên project hiện hữu, khối DO tự chuyển giá trị từ job cũ sang Vault trước khi thay job.
-- Trên project mới, tạo 3 secret cùng tên bên dưới; job sẽ tự bắt đầu chạy, không cần dựng lại.

create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists supabase_vault with schema vault;

do $$
declare
  v_command text;
  v_match text[];
begin
  select command into v_command from cron.job where jobname = 'run-monitor' limit 1;
  if v_command is not null then
    v_match := regexp_match(v_command, $re$(https://[a-z0-9-]+\.supabase\.co)$re$);
    if v_match is not null and not exists (
      select 1 from vault.decrypted_secrets where name = 'ai_notifier_project_url'
    ) then
      perform vault.create_secret(v_match[1], 'ai_notifier_project_url', 'Edge Function base URL');
    end if;

    v_match := regexp_match(v_command, $re$'Authorization'\s*,\s*'Bearer ([^']+)'$re$);
    if v_match is not null and v_match[1] not like '<%>' and not exists (
      select 1 from vault.decrypted_secrets where name = 'ai_notifier_service_role_key'
    ) then
      perform vault.create_secret(v_match[1], 'ai_notifier_service_role_key', 'Cron service role JWT');
    end if;
  end if;

  select command into v_command from cron.job where jobname = 'watchdog' limit 1;
  if v_command is not null then
    v_match := regexp_match(v_command, $re$lower\(email\)\s*=\s*'([^']+)'$re$);
    if v_match is not null and not exists (
      select 1 from vault.decrypted_secrets where name = 'ai_notifier_watchdog_email'
    ) then
      perform vault.create_secret(v_match[1], 'ai_notifier_watchdog_email', 'Watchdog recipient');
    end if;
  end if;
end $$;

select cron.unschedule('run-monitor')
where exists (select 1 from cron.job where jobname = 'run-monitor');
select cron.unschedule('reminder-tick')
where exists (select 1 from cron.job where jobname = 'reminder-tick');
select cron.unschedule('watchdog')
where exists (select 1 from cron.job where jobname = 'watchdog');

select cron.schedule(
  'run-monitor',
  '*/15 * * * *',
  $cron$
  with secrets as (
    select
      max(decrypted_secret) filter (where name = 'ai_notifier_project_url') as project_url,
      max(decrypted_secret) filter (where name = 'ai_notifier_service_role_key') as service_key
    from vault.decrypted_secrets
  )
  select net.http_post(
    url := rtrim(project_url, '/') || '/functions/v1/run-monitor',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  )
  from secrets
  where project_url is not null and service_key is not null;
  $cron$
);

select cron.schedule(
  'reminder-tick',
  '* * * * *',
  $cron$
  with secrets as (
    select
      max(decrypted_secret) filter (where name = 'ai_notifier_project_url') as project_url,
      max(decrypted_secret) filter (where name = 'ai_notifier_service_role_key') as service_key
    from vault.decrypted_secrets
  )
  select net.http_post(
    url := rtrim(project_url, '/') || '/functions/v1/run-monitor',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key
    ),
    body := '{"tick": true}'::jsonb,
    timeout_milliseconds := 60000
  )
  from secrets
  where project_url is not null and service_key is not null
    and (
      exists (
        select 1 from rules
        where is_active and source_type = 'reminder' and remind_at is not null
          and remind_at <= now() + interval '30 seconds'
          and (last_run_at is null or last_run_at < remind_at)
      )
      or exists (
        select 1 from rules
        where is_active
          and case when run_at ~ '^\d{1,2}:\d{2}$' then
            split_part(run_at, ':', 1)::integer between 0 and 23
            and split_part(run_at, ':', 2)::integer between 0 and 59
          else false end
          and (frequency is null or frequency <> 'change')
          and mod(
            extract(hour from (now() at time zone 'Asia/Ho_Chi_Minh'))::int * 60
              + extract(minute from (now() at time zone 'Asia/Ho_Chi_Minh'))::int
              - (split_part(run_at, ':', 1)::int * 60 + split_part(run_at, ':', 2)::int)
              + 1440,
            1440
          ) < 10
          and (last_run_at is null or last_run_at < now() - interval '10 minutes')
      )
    );
  $cron$
);

select cron.schedule(
  'watchdog',
  '*/15 * * * *',
  $cron$
  with secrets as (
    select max(decrypted_secret) filter (where name = 'ai_notifier_watchdog_email') as admin_email
    from vault.decrypted_secrets
  ), dead as (
    select 1 from secrets s
    where s.admin_email is not null
      and exists (
        select 1 from push_tokens pt join auth.users u on u.id = pt.user_id
        where lower(u.email) = lower(s.admin_email)
      )
      and exists (select 1 from cron_runs where trigger = 'cron')
      and not exists (
        select 1 from cron_runs
        where trigger = 'cron' and created_at > now() - interval '50 minutes'
      )
      and not exists (
        select 1 from watchdog_alerts where created_at > now() - interval '6 hours'
      )
  ), ins as (
    insert into watchdog_alerts (reason)
    select 'Không có lượt quét nền nào trong 50 phút.' from dead
    returning 1
  ), payload as (
    select jsonb_agg(jsonb_build_object(
      'to', pt.token,
      'title', '🚨 Hệ thống quét nền NGỪNG chạy',
      'body', 'Không có lượt quét nền nào trong 50 phút qua.',
      'sound', 'default'
    )) as body
    from push_tokens pt
    join auth.users u on u.id = pt.user_id
    cross join secrets s
    where lower(u.email) = lower(s.admin_email)
  )
  select net.http_post(
    url := 'https://exp.host/--/api/v2/push/send',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := payload.body
  )
  from ins cross join payload
  where payload.body is not null;
  $cron$
);
