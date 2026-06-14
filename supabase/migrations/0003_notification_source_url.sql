-- Phase 2B — Thông báo thật từ nguồn web
-- Chạy file này trong Supabase Dashboard → SQL Editor → New query → Run

-- source_url: link bài viết gốc mà AI lấy thông tin.
-- Vừa để người dùng bấm xem bài gốc, vừa để chống trùng (không insert lại cùng 1 URL cho cùng 1 rule).
alter table notifications add column if not exists source_url text;

-- Index giúp truy vấn "URL này đã tồn tại cho rule chưa" nhanh hơn khi chống trùng.
create index if not exists idx_notifications_rule_url
  on notifications (rule_id, source_url);
