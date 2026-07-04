-- VÂN TAY NỘI DUNG TRANG cho rule theo dõi URL (hash-gate, tiết kiệm AI).
--
-- run-monitor lưu contentFingerprint(text trang) sau mỗi lượt quét; lượt sau fetch xong
-- thấy vân tay TRÙNG (trang y nguyên) → skip ngay, 0 call AI. Không áp cho quét manual
-- ("Kiểm tra tin ngay") và rule ghim giờ (bản tin đúng hẹn luôn giao).
-- Chưa chạy migration này thì run-monitor tự bỏ cột khi update (không vỡ gì) —
-- nhưng hash-gate không hoạt động, mỗi lượt vẫn tốn 1 call flash-lite.
--
-- CHẠY TRONG: Supabase Dashboard → SQL Editor.

alter table rules add column if not exists last_content_hash text;
