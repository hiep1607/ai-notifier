-- Mute "êm" theo từng rule: rule vẫn chạy & vẫn tạo notification (xem trong app),
-- nhưng KHÔNG đẩy push về máy. Người dùng bật/tắt bằng nút trong chi tiết rule.
alter table rules
  add column if not exists muted boolean not null default false;
