-- Record one immutable group administrator and their operational email.
-- Run after 007. Existing groups are backfilled to their earliest member.

begin;

alter table public.groups
  add column if not exists created_by uuid references public.users(id),
  add column if not exists admin_email text;

update public.groups g
set created_by = (
  select gm.user_id
  from public.group_members gm
  where gm.group_id = g.id
  order by gm.joined_at asc, gm.user_id asc
  limit 1
)
where g.created_by is null;

drop function if exists public.create_group_with_owner(
  text, text, text, text, text, integer
);

create function public.create_group_with_owner(
  p_group_name text,
  p_link_id text,
  p_password_hash text,
  p_user_name text,
  p_admin_email text,
  p_recovery_code_hash text,
  p_starting_points integer default 1000
)
returns jsonb
language plpgsql
as $$
declare
  v_group_id uuid;
  v_user_id uuid;
begin
  if length(btrim(coalesce(p_group_name, ''))) not between 1 and 60 then
    raise exception 'group name is required' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_user_name, ''))) not between 1 and 40 then
    raise exception 'name is required' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_admin_email, ''))) not between 3 and 254
    or strpos(p_admin_email, '@') = 0 then
    raise exception 'admin email is required' using errcode = '22023';
  end if;
  if p_password_hash is null or p_recovery_code_hash is null then
    raise exception 'credentials are required' using errcode = '22023';
  end if;
  if p_starting_points <= 0 then
    raise exception 'starting points must be positive' using errcode = '22023';
  end if;

  insert into public.users (name, recovery_code_hash)
  values (btrim(p_user_name), p_recovery_code_hash)
  returning id into v_user_id;

  insert into public.groups (
    name, link_id, password_hash, created_by, admin_email
  ) values (
    btrim(p_group_name), p_link_id, p_password_hash, v_user_id,
    lower(btrim(p_admin_email))
  ) returning id into v_group_id;

  insert into public.group_members (group_id, user_id)
  values (v_group_id, v_user_id);

  insert into public.points_ledger (group_id, user_id, delta, reason)
  values (v_group_id, v_user_id, p_starting_points, 'allocation');

  return jsonb_build_object('group_id', v_group_id, 'user_id', v_user_id);
end;
$$;

revoke all on function public.create_group_with_owner(
  text, text, text, text, text, text, integer
) from public, anon, authenticated;
grant execute on function public.create_group_with_owner(
  text, text, text, text, text, text, integer
) to service_role;

commit;
