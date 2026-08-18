-- Durable recovery codes and transaction-safe group entry.
-- Run after 006.

begin;

alter table public.users add column if not exists recovery_code_hash text;
create unique index if not exists users_recovery_code_hash_uniq
  on public.users (recovery_code_hash)
  where recovery_code_hash is not null;

alter table public.join_attempts
  add column if not exists method text not null default 'password';

do $$
begin
  alter table public.join_attempts add constraint join_attempts_method_check
    check (method in ('password', 'recovery'));
exception
  when duplicate_object then null;
end $$;

create index if not exists join_attempts_method_lookup_idx
  on public.join_attempts (link_id, client_hash, method, attempted_at desc);

create or replace function public.create_group_with_owner(
  p_group_name         text,
  p_link_id            text,
  p_password_hash      text,
  p_user_name          text,
  p_recovery_code_hash text,
  p_starting_points    integer default 1000
)
returns jsonb
language plpgsql
as $$
declare
  v_group_id uuid;
  v_user_id  uuid;
begin
  if length(btrim(coalesce(p_group_name, ''))) not between 1 and 60 then
    raise exception 'group name is required' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_user_name, ''))) not between 1 and 40 then
    raise exception 'name is required' using errcode = '22023';
  end if;
  if p_password_hash is null or p_recovery_code_hash is null then
    raise exception 'credentials are required' using errcode = '22023';
  end if;
  if p_starting_points <= 0 then
    raise exception 'starting points must be positive' using errcode = '22023';
  end if;

  insert into public.groups (name, link_id, password_hash)
  values (btrim(p_group_name), p_link_id, p_password_hash)
  returning id into v_group_id;

  insert into public.users (name, recovery_code_hash)
  values (btrim(p_user_name), p_recovery_code_hash)
  returning id into v_user_id;

  insert into public.group_members (group_id, user_id)
  values (v_group_id, v_user_id);

  insert into public.points_ledger (group_id, user_id, delta, reason)
  values (v_group_id, v_user_id, p_starting_points, 'allocation');

  return jsonb_build_object('group_id', v_group_id, 'user_id', v_user_id);
end;
$$;

create or replace function public.join_group_member(
  p_group_id           uuid,
  p_user_name          text,
  p_recovery_code_hash text,
  p_starting_points    integer default 1000
)
returns uuid
language plpgsql
as $$
declare
  v_user_id uuid;
begin
  if not exists (select 1 from public.groups where id = p_group_id) then
    raise exception 'no such group' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_user_name, ''))) not between 1 and 40 then
    raise exception 'name is required' using errcode = '22023';
  end if;
  if p_recovery_code_hash is null or p_starting_points <= 0 then
    raise exception 'credentials and starting points are required' using errcode = '22023';
  end if;

  insert into public.users (name, recovery_code_hash)
  values (btrim(p_user_name), p_recovery_code_hash)
  returning id into v_user_id;

  insert into public.group_members (group_id, user_id)
  values (p_group_id, v_user_id);

  insert into public.points_ledger (group_id, user_id, delta, reason)
  values (p_group_id, v_user_id, p_starting_points, 'allocation');

  return v_user_id;
end;
$$;

create or replace function public.set_recovery_code(
  p_group_id           uuid,
  p_user_id            uuid,
  p_recovery_code_hash text
)
returns void
language plpgsql
as $$
begin
  if not exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = p_user_id
  ) then
    raise exception 'not a member of this group' using errcode = '42501';
  end if;
  if p_recovery_code_hash is null then
    raise exception 'recovery code is required' using errcode = '22023';
  end if;

  update public.users
  set recovery_code_hash = p_recovery_code_hash
  where id = p_user_id;
end;
$$;

revoke all on function public.create_group_with_owner(text, text, text, text, text, integer) from public, anon, authenticated;
revoke all on function public.join_group_member(uuid, text, text, integer) from public, anon, authenticated;
revoke all on function public.set_recovery_code(uuid, uuid, text) from public, anon, authenticated;

grant execute on function public.create_group_with_owner(text, text, text, text, text, integer) to service_role;
grant execute on function public.join_group_member(uuid, text, text, integer) to service_role;
grant execute on function public.set_recovery_code(uuid, uuid, text) to service_role;

commit;
