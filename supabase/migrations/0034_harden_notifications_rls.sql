-- Khóa quyền notifications: nội dung chỉ do Edge Function (service_role) tạo.
-- Client chỉ được đánh dấu đã đọc và gửi phản hồi chất lượng cho thông báo của mình.

-- Không còn cần đường sở hữu gián tiếp qua rule_id: migration 0021 đã backfill user_id,
-- còn reminder được detach khỏi rule vẫn giữ user_id trực tiếp.
update public.notifications n
set user_id = r.user_id
from public.rules r
where n.user_id is null and n.rule_id = r.id;

drop policy if exists "notifications_insert" on public.notifications;

drop policy if exists "notifications_select" on public.notifications;
create policy "notifications_select" on public.notifications
  for select using (user_id = auth.uid());

drop policy if exists "notifications_update" on public.notifications;
create policy "notifications_update" on public.notifications
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "notifications_delete" on public.notifications;
create policy "notifications_delete" on public.notifications
  for delete using (user_id = auth.uid());

-- Supabase mặc định cấp quyền bảng rộng cho anon/authenticated. Thu hồi quyền tạo nội
-- dung và quyền UPDATE mọi cột, sau đó chỉ mở đúng ba cột app thực sự cần sửa.
revoke insert on table public.notifications from public, anon, authenticated;
revoke update on table public.notifications from public, anon, authenticated;
grant update (is_read, feedback, feedback_at) on table public.notifications to authenticated;
