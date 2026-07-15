-- Chuẩn hóa dữ liệu cũ trước khi thêm constraints/index phục vụ các truy vấn nóng.

update rules set frequency = '1440'
where frequency is null or not (
  frequency = 'change'
  or case when frequency ~ '^\d+$' then frequency::numeric >= 30 else false end
  or frequency in ('m30', 'hourly', 'daily', 'weekly', 'realtime')
);
update rules set run_at = null
where run_at is not null and btrim(run_at) <> '' and not (
  case when run_at ~ '^\d{1,2}:\d{2}$' then
    split_part(run_at, ':', 1)::integer between 0 and 23
    and split_part(run_at, ':', 2)::integer between 0 and 59
  else false end
);
update rules set notify_mode = 'all' where notify_mode not in ('all', 'important') or notify_mode is null;
update rules set source_type = 'search' where source_type not in ('search', 'reminder', 'url') or source_type is null;
update rules set category = 'other'
where category is not null and category not in ('finance', 'news', 'tech', 'sports', 'weather', 'health', 'other');
update notifications set sentiment = 'neutral'
where sentiment is not null and sentiment not in ('positive', 'neutral', 'negative');
update push_tokens set platform = null where platform is not null and platform not in ('android', 'ios');
update user_settings set quiet_start = greatest(0, least(23, quiet_start));
update user_settings set quiet_end = greatest(0, least(23, quiet_end));

alter table rules alter column frequency set default '1440';
alter table rules alter column frequency set not null;
alter table rules alter column notify_mode set not null;
alter table rules alter column source_type set not null;

alter table rules drop constraint if exists rules_frequency_check;
alter table rules add constraint rules_frequency_check check (
  frequency = 'change'
  or frequency in ('m30', 'hourly', 'daily', 'weekly', 'realtime')
  or case when frequency ~ '^\d+$' then frequency::numeric >= 30 else false end
);
alter table rules drop constraint if exists rules_run_at_check;
alter table rules add constraint rules_run_at_check check (
  run_at is null or btrim(run_at) = '' or case when run_at ~ '^\d{1,2}:\d{2}$' then
    split_part(run_at, ':', 1)::integer between 0 and 23
    and split_part(run_at, ':', 2)::integer between 0 and 59
  else false end
);
alter table rules drop constraint if exists rules_notify_mode_check;
alter table rules add constraint rules_notify_mode_check check (notify_mode in ('all', 'important'));
alter table rules drop constraint if exists rules_source_type_check;
alter table rules add constraint rules_source_type_check check (source_type in ('search', 'reminder', 'url'));
alter table rules drop constraint if exists rules_category_check;
alter table rules add constraint rules_category_check check (
  category is null or category in ('finance', 'news', 'tech', 'sports', 'weather', 'health', 'other')
);
alter table rules drop constraint if exists rules_source_fields_check;
alter table rules add constraint rules_source_fields_check check (
  (source_type = 'reminder' and remind_at is not null and watch_url is null)
  or (source_type = 'url' and watch_url ~* '^https?://')
  or source_type = 'search'
);

alter table notifications drop constraint if exists notifications_sentiment_check;
alter table notifications add constraint notifications_sentiment_check check (
  sentiment is null or sentiment in ('positive', 'neutral', 'negative')
);
alter table push_tokens drop constraint if exists push_tokens_platform_check;
alter table push_tokens add constraint push_tokens_platform_check check (
  platform is null or platform in ('android', 'ios')
);
alter table user_settings drop constraint if exists user_settings_quiet_start_check;
alter table user_settings add constraint user_settings_quiet_start_check check (quiet_start between 0 and 23);
alter table user_settings drop constraint if exists user_settings_quiet_end_check;
alter table user_settings add constraint user_settings_quiet_end_check check (quiet_end between 0 and 23);

create index if not exists idx_rules_user_active_due
  on rules (user_id, is_active, last_run_at);
create index if not exists idx_rules_active_due
  on rules (last_run_at) where is_active;
create index if not exists idx_notifications_user_created
  on notifications (user_id, created_at desc);
create index if not exists idx_notifications_rule_created
  on notifications (rule_id, created_at desc);
create index if not exists idx_notifications_user_unread
  on notifications (user_id, created_at desc) where not is_read;
