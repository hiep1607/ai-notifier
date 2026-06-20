-- Thêm cột detail cho cron_runs: lưu TÊN các rule đã quét trong lần chạy đó
-- (để trang Quản trị hiện "quét rule nào"). CHẠY TRONG: Supabase SQL Editor → Run.
alter table cron_runs add column if not exists detail text;
