-- Let a single legacy, phone-less membership be claimed by its registered
-- name after the shared group password has been verified by the application.
-- This reuses the UUID and allocation; it never creates a duplicate member.

begin;

create or replace function public.enter_group_member_phone(
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
  v_name_matches integer;
  v_phone_attached_at timestamptz;
  v_needs_recovery boolean;
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

  select count(*) into v_name_matches
  from public.group_members gm
  join public.users u on u.id = gm.user_id
  where gm.group_id = p_group_id
    and lower(regexp_replace(btrim(u.name), '[[:space:]]+', ' ', 'g')) = v_name_key;

  if v_name_matches > 1 then
    raise exception 'multiple legacy members use that name; use a recovery code'
      using errcode = '23505';
  elsif v_name_matches = 1 then
    select gm.user_id, gm.phone_attached_at, u.recovery_code_hash is null
      into v_user_id, v_phone_attached_at, v_needs_recovery
    from public.group_members gm
    join public.users u on u.id = gm.user_id
    where gm.group_id = p_group_id
      and lower(regexp_replace(btrim(u.name), '[[:space:]]+', ' ', 'g')) = v_name_key;
    if v_phone_attached_at is not null then
      raise exception 'that name is already registered; use its original phone number or recovery code'
        using errcode = '23505';
    end if;
    update public.group_members
    set phone_hash = p_phone_hash,
        identity_code = p_identity_code,
        phone_attached_at = now()
    where group_id = p_group_id and user_id = v_user_id;
    if v_needs_recovery then
      update public.users set recovery_code_hash = p_recovery_code_hash
      where id = v_user_id;
    end if;
    return jsonb_build_object(
      'user_id', v_user_id,
      'created', false,
      'recovery_created', v_needs_recovery
    );
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

commit;
