-- Cài đặt theo người dùng mà SERVER cần đọc (push gửi từ run-monitor, không đọc được
-- AsyncStorage của client). Hiện dùng cho "Giờ yên lặng": trong khung giờ này KHÔNG đẩy
-- push về máy (thông báo vẫn lưu, vẫn xem trong app).
create table if not exists user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  quiet_enabled boolean not null default false,
  quiet_start int not null default 22,  -- giờ VN bắt đầu yên lặng (0..23)
  quiet_end int not null default 7,     -- giờ VN kết thúc yên lặng (0..23), cho phép vắt qua nửa đêm
  updated_at timestamptz default now()
);

-- Nếu bảng đã tồn tại từ trước (create table bị bỏ qua) → vẫn đảm bảo có đủ cột.
alter table user_settings add column if not exists quiet_enabled boolean not null default false;
alter table user_settings add column if not exists quiet_start int not null default 22;
alter table user_settings add column if not exists quiet_end int not null default 7;
alter table user_settings add column if not exists updated_at timestamptz default now();

alter table user_settings enable row level security;

-- Mỗi người chỉ đọc/ghi cài đặt của chính mình. Server dùng service_role nên bỏ qua RLS.
drop policy if exists "user_settings own select" on user_settings;
create policy "user_settings own select" on user_settings
  for select using (auth.uid() = user_id);

drop policy if exists "user_settings own insert" on user_settings;
create policy "user_settings own insert" on user_settings
  for insert with check (auth.uid() = user_id);

drop policy if exists "user_settings own update" on user_settings;
create policy "user_settings own update" on user_settings
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
