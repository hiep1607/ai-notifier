-- Pha 3 trang quản trị — bảng log để theo dõi quota Gemini & sức khỏe cron.
-- CHẠY TRONG: Supabase Dashboard → SQL Editor → New query → Run.
-- RLS bật, KHÔNG tạo policy ⇒ user thường bị chặn hoàn toàn; chỉ service_role
-- (run-monitor ghi, admin-api đọc) truy cập được. Không ảnh hưởng app người dùng.

-- ===== usage_logs: mỗi lần gọi Gemini (đếm quota/ngày) =====
create table if not exists usage_logs (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  kind text not null default 'gemini',
  rule_id uuid,
  ok boolean not null default true,   -- false = call lỗi (mạng/quota)
  error text
);
create index if not exists idx_usage_logs_created on usage_logs (created_at desc);
alter table usage_logs enable row level security;

-- ===== cron_runs: mỗi lần run-monitor chạy (sức khỏe nền) =====
create table if not exists cron_runs (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  trigger text not null default 'cron',  -- cron | manual | user
  rules_scanned int not null default 0,
  inserted int not null default 0,
  quota_hit boolean not null default false,
  duration_ms int not null default 0
);
create index if not exists idx_cron_runs_created on cron_runs (created_at desc);
alter table cron_runs enable row level security;
