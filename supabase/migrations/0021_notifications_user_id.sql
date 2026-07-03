-- Nhắc hẹn TỰ XÓA HẲN sau khi nhắc, nhưng GIỮ thông báo (user chọn 2026-07-03).
-- Vấn đề gốc: notifications gắn với rule bằng FK ON DELETE CASCADE (0014) + RLS chỉ cho xem
-- thông báo "thuộc rule của mình" → xóa rule là thông báo bay theo. Sửa bằng cách cho
-- notifications CHỦ SỞ HỮU TRỰC TIẾP (user_id): server gỡ rule_id trước khi xóa rule,
-- thông báo thành "mồ côi rule" nhưng vẫn của user, vẫn hiện trong app.
--
-- CHẠY TRONG: Supabase Dashboard → SQL Editor → Run. KHÔNG cần thay key gì.

-- (1) Cột chủ sở hữu + backfill từ rule hiện có.
alter table notifications add column if not exists user_id uuid references auth.users(id) on delete cascade;
update notifications n set user_id = r.user_id
  from rules r where n.rule_id = r.id and n.user_id is null;
create index if not exists idx_notifications_user on notifications (user_id);

-- rule_id giờ được phép trống (thông báo mồ côi rule sau khi nhắc hẹn tự xóa).
alter table notifications alter column rule_id drop not null;

-- (2) RLS: thêm đường sở hữu trực tiếp (user_id) BÊN CẠNH đường cũ qua rule.
drop policy if exists "notifications_select" on notifications;
create policy "notifications_select" on notifications
  for select using (
    user_id = auth.uid()
    or rule_id in (select id from rules where user_id = auth.uid())
  );

drop policy if exists "notifications_insert" on notifications;
create policy "notifications_insert" on notifications
  for insert with check (
    user_id = auth.uid()
    or rule_id in (select id from rules where user_id = auth.uid())
  );

drop policy if exists "notifications_update" on notifications;
create policy "notifications_update" on notifications
  for update using (
    user_id = auth.uid()
    or rule_id in (select id from rules where user_id = auth.uid())
  );

drop policy if exists "notifications_delete" on notifications;
create policy "notifications_delete" on notifications
  for delete using (
    user_id = auth.uid()
    or rule_id in (select id from rules where user_id = auth.uid())
  );

-- (3) Dọn nốt các nhắc hẹn ĐÃ NHẮC XONG còn sót từ trước: giữ thông báo (gỡ rule_id —
-- user_id đã backfill ở bước 1), rồi xóa xác rule.
update notifications set rule_id = null
  where rule_id in (
    select id from rules
    where source_type = 'reminder' and is_active = false
      and last_run_at is not null and remind_at is not null
      and last_run_at >= remind_at
  );
delete from rules
  where source_type = 'reminder' and is_active = false
    and last_run_at is not null and remind_at is not null
    and last_run_at >= remind_at;
