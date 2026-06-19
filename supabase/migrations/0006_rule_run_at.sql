-- Phase 2E — Đặt GIỜ cụ thể trong ngày cho rule định kỳ.
-- run_at: giờ báo theo GIỜ VIỆT NAM dạng "HH:MM" (vd "08:00"). Rỗng/null = không ghim giờ
-- (dùng lịch theo chu kỳ như cũ). Áp dụng cho frequency hằng ngày/hằng tuần.
--
-- CHẠY TRONG: Supabase Dashboard → SQL Editor → New query → Run.

alter table rules add column if not exists run_at text;
