-- 0024: usage_logs thêm cột model — mỗi model Gemini có TRẦN NGÀY riêng
-- (2026-07: flash-lite free chỉ còn 20 lượt/ngày) nên phải đếm theo bucket
-- mới biết còn bao nhiêu. Server đã tự chịu được khi cột chưa có (ghi dạng cũ).
alter table usage_logs add column if not exists model text;
