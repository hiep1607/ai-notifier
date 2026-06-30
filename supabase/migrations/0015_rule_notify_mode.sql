-- Chế độ thông báo theo từng rule (chống "thông báo rác"):
--   'all'       = đầy đủ: gửi cả tin thật lẫn fallback ("chưa có thay đổi"/"chưa tìm thấy"/gợi ý liên quan).
--   'important' = chỉ tin quan trọng: BỎ HẲN fallback + tin thật chỉ gửi khi is_important hoặc thỏa điều kiện.
-- Mặc định 'all' để tương thích rule cũ; lúc tạo rule, AI có thể đề xuất 'important' cho chủ đề dễ ra rác.
alter table rules
  add column if not exists notify_mode text not null default 'all';
