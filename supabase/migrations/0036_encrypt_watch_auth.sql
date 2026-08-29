-- Mã hóa Cookie/Authorization dùng cho rule theo dõi trang đăng nhập.
-- Client chỉ lưu/xóa qua RPC; chỉ service_role của run-monitor được giải mã.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists supabase_vault with schema vault;

do $$
begin
  if not exists (
    select 1 from vault.decrypted_secrets where name = 'ai_notifier_watch_auth_key'
  ) then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'ai_notifier_watch_auth_key',
      'AES key for encrypted rule watch credentials'
    );
  end if;
end $$;

alter table public.rules
  add column if not exists watch_auth_ciphertext bytea;
alter table public.rules
  add column if not exists has_watch_auth boolean
    generated always as (watch_auth_ciphertext is not null) stored;

-- Chuyển dữ liệu rõ hiện có sang ciphertext rồi xóa bản rõ.
do $$
declare
  v_key text;
begin
  select decrypted_secret into v_key
  from vault.decrypted_secrets
  where name = 'ai_notifier_watch_auth_key'
  limit 1;
  if v_key is null then raise exception 'watch auth encryption key is missing'; end if;

  update public.rules
  set watch_auth_ciphertext = extensions.pgp_sym_encrypt(
        watch_auth,
        v_key,
        'cipher-algo=aes256, compress-algo=1'
      ),
      watch_auth = null
  where watch_auth is not null and btrim(watch_auth) <> '';

  -- Cả chuỗi rỗng cũ cũng phải bị xóa để cột plaintext luôn trống sau migration.
  update public.rules
  set watch_auth = null
  where watch_auth is not null;
end $$;

create or replace function public.set_rule_watch_auth(p_rule_id uuid, p_auth text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_key text;
  v_value text := nullif(btrim(p_auth), '');
  v_changed boolean;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  if v_value is not null and length(v_value) > 16000 then
    raise exception 'watch credentials are too long';
  end if;

  select decrypted_secret into v_key
  from vault.decrypted_secrets
  where name = 'ai_notifier_watch_auth_key'
  limit 1;
  if v_key is null then raise exception 'watch auth encryption key is missing'; end if;

  update public.rules
  set watch_auth_ciphertext = case
        when v_value is null then null
        else extensions.pgp_sym_encrypt(v_value, v_key, 'cipher-algo=aes256, compress-algo=1')
      end,
      watch_auth = null
  where id = p_rule_id and user_id = v_uid and watch_url is not null
  returning true into v_changed;

  return coalesce(v_changed, false);
end;
$$;

create or replace function public.read_rule_watch_auth(p_rule_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_key text;
  v_cipher bytea;
begin
  select decrypted_secret into v_key
  from vault.decrypted_secrets
  where name = 'ai_notifier_watch_auth_key'
  limit 1;
  if v_key is null then raise exception 'watch auth encryption key is missing'; end if;

  select watch_auth_ciphertext into v_cipher
  from public.rules
  where id = p_rule_id;

  if v_cipher is null then return null; end if;
  return extensions.pgp_sym_decrypt(v_cipher, v_key);
end;
$$;

-- Đổi URL phải xóa credential của origin cũ, tránh vô tình gửi Cookie sang domain mới.
create or replace function public.clear_watch_auth_on_url_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.watch_url is distinct from new.watch_url then
    new.watch_auth := null;
    new.watch_auth_ciphertext := null;
  end if;
  return new;
end;
$$;

drop trigger if exists rules_clear_watch_auth_on_url_change on public.rules;
create trigger rules_clear_watch_auth_on_url_change
  before update of watch_url on public.rules
  for each row execute function public.clear_watch_auth_on_url_change();

revoke all on function public.set_rule_watch_auth(uuid, text) from public, anon;
grant execute on function public.set_rule_watch_auth(uuid, text) to authenticated;
revoke all on function public.read_rule_watch_auth(uuid) from public, anon, authenticated;
grant execute on function public.read_rule_watch_auth(uuid) to service_role;
revoke all on function public.clear_watch_auth_on_url_change() from public, anon, authenticated;

-- Không cho client ghi cột server hoặc lách RPC bằng watch_auth bản rõ/ciphertext.
revoke insert on table public.rules from public, anon, authenticated;
grant insert (
  user_id, title, description, keyword, category, sources, frequency, run_at,
  condition, is_active, muted, notify_mode, source_type, remind_at, watch_url
) on table public.rules to authenticated;

revoke update on table public.rules from public, anon, authenticated;
grant update (
  title, description, keyword, category, sources, frequency, run_at, condition,
  is_active, muted, notify_mode, source_type, remind_at, watch_url
) on table public.rules to authenticated;
