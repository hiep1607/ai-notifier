-- Phase 2D — Lịch quét theo từng rule.
-- last_run_at: lần cuối run-monitor quét rule này → để tính "tới hạn" theo frequency
-- (change=15p, m30=30p, hourly=60p, daily, weekly). Tối thiểu 30 phút cho rule thường.
--
-- CHẠY TRONG: Supabase Dashboard → SQL Editor → New query → Run.

alter table rules add column if not exists last_run_at timestamptz;
