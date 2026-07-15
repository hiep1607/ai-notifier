-- Các công tắc trên màn Settings phải là cấu hình server thật, không chỉ AsyncStorage.
alter table public.user_settings add column if not exists notifications_enabled boolean not null default true;
alter table public.user_settings add column if not exists sound_enabled boolean not null default true;
alter table public.user_settings add column if not exists vibration_enabled boolean not null default false;
alter table public.user_settings add column if not exists ai_summary_enabled boolean not null default true;
alter table public.user_settings add column if not exists important_alerts_enabled boolean not null default true;
