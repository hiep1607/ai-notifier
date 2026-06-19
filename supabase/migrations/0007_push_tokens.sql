-- Phase 2F — Push notification (báo đẩy khi đóng app).
-- Lưu Expo push token của mỗi thiết bị/người dùng. run-monitor (service role) đọc bảng này
-- để gửi push qua Expo Push API sau khi tạo thông báo mới.
--
-- CHẠY TRONG: Supabase Dashboard → SQL Editor → New query → Run.

create table if not exists push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique,
  platform text,
  created_at timestamptz default now()
);

create index if not exists idx_push_tokens_user on push_tokens (user_id);

alter table push_tokens enable row level security;

-- Mỗi user chỉ thao tác token của chính mình (Edge Function dùng service role nên bỏ qua RLS).
drop policy if exists "own tokens select" on push_tokens;
drop policy if exists "own tokens insert" on push_tokens;
drop policy if exists "own tokens update" on push_tokens;
drop policy if exists "own tokens delete" on push_tokens;

create policy "own tokens select" on push_tokens for select using (auth.uid() = user_id);
create policy "own tokens insert" on push_tokens for insert with check (auth.uid() = user_id);
create policy "own tokens update" on push_tokens for update using (auth.uid() = user_id);
create policy "own tokens delete" on push_tokens for delete using (auth.uid() = user_id);
