-- Tương thích các bản app đã phát hành trước 0036: chúng còn UPDATE rules.watch_auth
-- trực tiếp. Cho phép đúng cột legacy này, nhưng trigger mã hóa ngay trong cùng
-- transaction và luôn ghi NULL vào plaintext. App mới vẫn dùng set_rule_watch_auth().

create or replace function public.clear_watch_auth_on_url_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text;
  v_value text;
begin
  -- Credential chỉ hợp lệ với đúng URL/origin lúc người dùng cấp.
  if old.watch_url is distinct from new.watch_url then
    new.watch_auth := null;
    new.watch_auth_ciphertext := null;
    return new;
  end if;

  -- Chỉ trigger legacy_write xử lý việc client nhắm tới cột watch_auth. Trigger URL
  -- dùng chung function nhưng không được hiểu NULL hiện có là yêu cầu thu hồi.
  if tg_argv[0] = 'legacy_write' then
    v_value := nullif(btrim(new.watch_auth), '');
    if v_value is not null and length(v_value) > 16000 then
      raise exception 'watch credentials are too long';
    end if;

    -- RPC mới thay đổi ciphertext và đồng thời ép watch_auth=NULL: giữ kết quả RPC.
    -- App cũ chỉ gửi watch_auth=NULL nên ciphertext không đổi trong NEW: đó mới là
    -- yêu cầu thu hồi và phải xóa ciphertext.
    if v_value is null and new.watch_auth_ciphertext is distinct from old.watch_auth_ciphertext then
      new.watch_auth := null;
    elsif v_value is null then
      new.watch_auth_ciphertext := null;
    else
      select decrypted_secret into v_key
      from vault.decrypted_secrets
      where name = 'ai_notifier_watch_auth_key'
      limit 1;
      if v_key is null then raise exception 'watch auth encryption key is missing'; end if;
      new.watch_auth_ciphertext := extensions.pgp_sym_encrypt(
        v_value,
        v_key,
        'cipher-algo=aes256, compress-algo=1'
      );
    end if;
    new.watch_auth := null;
  end if;

  return new;
end;
$$;

drop trigger if exists rules_clear_watch_auth_on_url_change on public.rules;
create trigger rules_clear_watch_auth_on_url_change
  before update of watch_url on public.rules
  for each row execute function public.clear_watch_auth_on_url_change('url_change');

drop trigger if exists rules_encrypt_legacy_watch_auth on public.rules;
create trigger rules_encrypt_legacy_watch_auth
  before update of watch_auth on public.rules
  for each row execute function public.clear_watch_auth_on_url_change('legacy_write');

revoke all on function public.clear_watch_auth_on_url_change() from public, anon, authenticated;

-- RLS rules_update vẫn bắt buộc user_id = auth.uid(); grant này chỉ duy trì API của
-- app cũ. Trigger ở trên bảo đảm client không thể để plaintext tồn tại trong DB.
grant update (watch_auth) on table public.rules to authenticated;
