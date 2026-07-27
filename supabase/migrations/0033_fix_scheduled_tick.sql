-- Sửa tick rule ghim giờ: một lần quét tay trước giờ hẹn không được làm tick bỏ qua.
-- So last_run_at với đúng MỐC HẸN hôm nay, thay vì "now() - 10 phút".

select cron.unschedule('reminder-tick')
where exists (select 1 from cron.job where jobname = 'reminder-tick');

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
          and (
            last_run_at is null
            or last_run_at < (
              date_trunc('day', now() at time zone 'Asia/Ho_Chi_Minh')
              + make_interval(
                  hours => split_part(run_at, ':', 1)::int,
                  mins => split_part(run_at, ':', 2)::int
                )
            ) at time zone 'Asia/Ho_Chi_Minh'
          )
      )
    );
  $cron$
);
