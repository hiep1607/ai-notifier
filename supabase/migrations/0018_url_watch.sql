-- Theo dõi TRANG WEB CỤ THỂ (Pha E): rule source_type='url' — server fetch trang,
-- AI trích giá trị theo yêu cầu, báo khi thay đổi. Dùng cho trang KHÔNG có RSS/API.
--   watch_url  : URL trang cần theo dõi (http/https).
--   watch_auth : thông tin đăng nhập người dùng TỰ CẤP cho trang cần login —
--                dán Cookie (hoặc từng dòng "Header: value", vd "Authorization: Bearer ...").
--                RLS của bảng rules đã chặn user khác đọc; chỉ chủ rule + service_role thấy.
alter table rules
  add column if not exists watch_url text;
alter table rules
  add column if not exists watch_auth text;
