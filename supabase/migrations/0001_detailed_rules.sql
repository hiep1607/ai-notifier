-- Phase 2A.2 — Thêm trường chi tiết cho rules & notifications
-- Chạy file này trong Supabase Dashboard → SQL Editor → New query → Run

-- ===== RULES =====
alter table rules add column if not exists category   text;
alter table rules add column if not exists sources    text;
alter table rules add column if not exists frequency  text default 'daily';
alter table rules add column if not exists condition  text;

-- ===== NOTIFICATIONS =====
alter table notifications add column if not exists source    text;
alter table notifications add column if not exists details   text;
alter table notifications add column if not exists category  text;
alter table notifications add column if not exists sentiment text;
