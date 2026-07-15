-- Chuyển Expo push token an toàn giữa các tài khoản dùng chung một thiết bị.
-- Upsert trực tiếp bị RLS chặn khi token đang thuộc user cũ; hai RPC dưới đây luôn
-- lấy user_id từ JWT, không tin id do client gửi lên.

create or replace function public.claim_push_token(p_token text, p_platform text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  if p_token is null or length(p_token) not between 10 and 512 then
    raise exception 'invalid push token';
  end if;
  if p_platform is not null and p_platform not in ('android', 'ios') then
    raise exception 'invalid platform';
  end if;

  insert into public.push_tokens (user_id, token, platform)
  values (v_uid, p_token, p_platform)
  on conflict (token) do update
    set user_id = excluded.user_id,
        platform = excluded.platform,
        created_at = now();
end;
$$;

create or replace function public.release_push_token(p_token text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_tokens
  where token = p_token and user_id = auth.uid();
$$;

revoke all on function public.claim_push_token(text, text) from public, anon;
revoke all on function public.release_push_token(text) from public, anon;
grant execute on function public.claim_push_token(text, text) to authenticated;
grant execute on function public.release_push_token(text) to authenticated;
