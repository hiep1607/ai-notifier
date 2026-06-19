-- Liên kết 1 thông báo fallback ("chưa có thay đổi") tới THÔNG BÁO TRƯỚC của cùng rule.
-- Khi không tìm thấy tin mới, ta không có URL bài gốc → thay vào đó cho người dùng
-- mở lại thông báo gần nhất ngay trong app (điều hướng nội bộ, không phải link web).
--
-- CHẠY TRONG: Supabase Dashboard → SQL Editor → New query → Run.

alter table notifications
  add column if not exists related_notification_id uuid
  references notifications(id) on delete set null;
