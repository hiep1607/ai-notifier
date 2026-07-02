-- Loại rule NHẮC HẸN (Pha D): "nhắc deadline bài tập 20/7 lúc 9h" — không cần nguồn tin,
-- đến hẹn thì push 1 thông báo rồi tự tắt rule.
--   source_type : phân loại tường minh ('search' mặc định; 'reminder' = nhắc hẹn).
--                 (weather/crypto/fx hiện tự nhận diện lúc quét, chưa cần ghi cột.)
--   remind_at   : thời điểm nhắc (timestamptz). Chỉ dùng khi source_type='reminder'.
alter table rules
  add column if not exists source_type text not null default 'search';
alter table rules
  add column if not exists remind_at timestamptz;
