-- Đặt ON DELETE CASCADE cho notifications.rule_id.
-- Trước đây FK không cascade nên khi xóa rule phải xóa thủ công thông báo con trước
-- (xem admin-api: rule_action/delete + delete_user). User thường xóa rule của họ từ
-- client sẽ dính lỗi FK 23503. Migration này gắn cascade để DB tự dọn thông báo con.
--
-- CHẠY TRONG: Supabase Dashboard → SQL Editor → New query → Run.

do $$
declare
  fk_name text;
begin
  -- Tìm mọi FK trên notifications.rule_id (tên có thể là notifications_rule_id_fkey
  -- hoặc tên khác tùy lúc bảng được tạo) và bỏ đi.
  for fk_name in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = any(con.conkey)
    where rel.relname = 'notifications'
      and con.contype = 'f'
      and att.attname = 'rule_id'
  loop
    execute format('alter table notifications drop constraint %I', fk_name);
  end loop;

  -- Gắn lại FK với ON DELETE CASCADE: xóa rule → tự xóa mọi thông báo của rule đó.
  alter table notifications
    add constraint notifications_rule_id_fkey
    foreign key (rule_id) references rules(id) on delete cascade;
end $$;
