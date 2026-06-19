-- Trigger "thay đổi": lưu số liệu chính lần quét trước để so sánh (vd giá vàng đổi X%).
-- run-monitor truyền giá trị này vào Gemini để quyết định "changed" → chỉ báo khi thực sự đổi.
alter table rules add column if not exists last_value text;
