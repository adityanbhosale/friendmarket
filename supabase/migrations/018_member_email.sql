-- Store an optional delivery address only after the user has proved membership
-- in the group. The server-only service role is the sole caller.

begin;

create function public.set_member_email(
  p_group_id uuid,
  p_user_id uuid,
  p_email text
)
returns void
language plpgsql
as $$
begin
  if not exists (
    select 1
    from public.group_members
    where group_id = p_group_id and user_id = p_user_id
  ) then
    raise exception 'not a member of this group' using errcode = '42501';
  end if;

  if length(btrim(coalesce(p_email, ''))) not between 3 and 254
    or strpos(btrim(p_email), '@') <= 1
  then
    raise exception 'invalid email address' using errcode = '22023';
  end if;

  update public.users
  set email = lower(btrim(p_email))
  where id = p_user_id;
end;
$$;

revoke all on function public.set_member_email(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.set_member_email(uuid, uuid, text)
  to service_role;

commit;
