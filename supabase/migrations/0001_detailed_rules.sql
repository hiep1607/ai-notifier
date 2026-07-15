-- Baseline + trường chi tiết cho rules & notifications.
-- Hai bảng từng được tạo thủ công trước khi repository có migration; CREATE IF NOT
-- EXISTS giúp một project Supabase mới bootstrap được toàn bộ migration từ số 0001.

create table if not exists public.rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text not null default '',
  keyword text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.rules(id),
  title text not null,
  content text not null default '',
  ai_summary text not null default '',
  is_read boolean not null default false,
  is_important boolean not null default false,
  created_at timestamptz not null default now()
);

-- ===== RULES =====
alter table rules add column if not exists category   text;
alter table rules add column if not exists sources    text;
alter table rules add column if not exists frequency  text default '1440';
alter table rules add column if not exists condition  text;

-- ===== NOTIFICATIONS =====
alter table notifications add column if not exists source    text;
alter table notifications add column if not exists details   text;
alter table notifications add column if not exists category  text;
alter table notifications add column if not exists sentiment text;
