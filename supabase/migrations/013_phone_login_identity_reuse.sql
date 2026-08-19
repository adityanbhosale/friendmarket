-- A phone identity reopens its existing group-member UUID. A registered name
-- cannot be used to create another UUID in the same group.

begin;

create function public.enter_group_member_phone(
  p_group_id uuid,
  p_user_name text,
  p_recovery_code_hash text,
  p_phone_hash text,
  p_identity_code text,
  p_starting_points integer default 1000
)
returns jsonb
language plpgsql
as $$
declare
  v_user_id uuid;
  v_registered_name text;
  v_name_key text;
begin
  if not exists (select 1 from public.groups where id = p_group_id)
    or length(btrim(coalesce(p_user_name, ''))) not between 1 and 40
    or p_recovery_code_hash is null
    or p_phone_hash is null
    or p_phone_hash !~ '^[0-9a-f]{64}$'
    or p_identity_code is null
    or p_identity_code !~ '^SB-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$'
    or p_starting_points <= 0
  then
    raise exception 'invalid group entry' using errcode = '22023';
  end if;

  v_name_key := lower(regexp_replace(btrim(p_user_name), '[[:space:]]+', ' ', 'g'));

  -- Serializes phone and display-name claims inside one group. Without this,
  -- two first-time requests could both pass the checks and create two UUIDs.
  perform pg_advisory_xact_lock(hashtext(p_group_id::text || ':member-entry'));

  select gm.user_id, u.name
    into v_user_id, v_registered_name
  from public.group_members gm
  join public.users u on u.id = gm.user_id
  where gm.group_id = p_group_id
    and gm.phone_attached_at is not null
    and gm.phone_hash = p_phone_hash
  limit 1;

  if found then
    if lower(regexp_replace(btrim(v_registered_name), '[[:space:]]+', ' ', 'g'))
      is distinct from v_name_key
    then
      raise exception 'that phone number and name do not match the registered member'
        using errcode = '42501';
    end if;
    return jsonb_build_object('user_id', v_user_id, 'created', false);
  end if;

  if exists (
    select 1
    from public.group_members gm
    join public.users u on u.id = gm.user_id
    where gm.group_id = p_group_id
      and lower(regexp_replace(btrim(u.name), '[[:space:]]+', ' ', 'g')) = v_name_key
  ) then
    raise exception 'that name is already registered; use its original phone number or recovery code'
      using errcode = '23505';
  end if;

  insert into public.users (name, recovery_code_hash)
  values (btrim(p_user_name), p_recovery_code_hash)
  returning id into v_user_id;
  insert into public.group_members (
    group_id, user_id, phone_hash, identity_code, phone_attached_at
  ) values (
    p_group_id, v_user_id, p_phone_hash, p_identity_code, now()
  );
  insert into public.points_ledger (group_id, user_id, delta, reason)
  values (p_group_id, v_user_id, p_starting_points, 'allocation');

  return jsonb_build_object('user_id', v_user_id, 'created', true);
end;
$$;

create or replace function public.join_group_member_phone(
  p_group_id uuid,
  p_user_name text,
  p_recovery_code_hash text,
  p_phone_hash text,
  p_identity_code text,
  p_starting_points integer default 1000
)
returns uuid
language plpgsql
as $$
declare v_entry jsonb;
begin
  v_entry := public.enter_group_member_phone(
    p_group_id, p_user_name, p_recovery_code_hash,
    p_phone_hash, p_identity_code, p_starting_points
  );
  return (v_entry->>'user_id')::uuid;
end;
$$;

create function public.enter_group_member_phone_imessage(
  p_token_hash text,
  p_group_id uuid,
  p_user_name text,
  p_recovery_code_hash text,
  p_phone_hash text,
  p_identity_code text,
  p_starting_points integer default 1000
)
returns jsonb
language plpgsql
as $$
declare v_setup_group uuid; v_entry jsonb;
begin
  select group_id into v_setup_group
  from public.imessage_setup_tokens
  where token_hash = p_token_hash
    and consumed_at is null
    and expires_at > now()
  for update;
  if not found then
    raise exception 'that iMessage setup link is invalid or expired' using errcode = '22023';
  end if;
  if v_setup_group is not null and v_setup_group is distinct from p_group_id then
    raise exception 'that iMessage setup link belongs to another Sidebar group'
      using errcode = '42501';
  end if;

  v_entry := public.enter_group_member_phone(
    p_group_id, p_user_name, p_recovery_code_hash,
    p_phone_hash, p_identity_code, p_starting_points
  );
  perform public.consume_imessage_setup(
    p_token_hash, p_group_id, (v_entry->>'user_id')::uuid
  );
  return v_entry;
end;
$$;

create or replace function public.join_group_member_phone_imessage(
  p_token_hash text,
  p_group_id uuid,
  p_user_name text,
  p_recovery_code_hash text,
  p_phone_hash text,
  p_identity_code text,
  p_starting_points integer default 1000
)
returns uuid
language plpgsql
as $$
declare v_entry jsonb;
begin
  v_entry := public.enter_group_member_phone_imessage(
    p_token_hash, p_group_id, p_user_name, p_recovery_code_hash,
    p_phone_hash, p_identity_code, p_starting_points
  );
  return (v_entry->>'user_id')::uuid;
end;
$$;

revoke all on function public.enter_group_member_phone(uuid, text, text, text, text, integer)
  from public, anon, authenticated;
revoke all on function public.enter_group_member_phone_imessage(text, uuid, text, text, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.enter_group_member_phone(uuid, text, text, text, text, integer)
  to service_role;
grant execute on function public.enter_group_member_phone_imessage(text, uuid, text, text, text, text, integer)
  to service_role;

commit;
