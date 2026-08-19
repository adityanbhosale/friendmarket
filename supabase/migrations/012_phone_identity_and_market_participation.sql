-- Stable private member identity, explicit market participation, and subject
-- betting restrictions. Raw phone numbers never enter the database.

begin;

alter table public.group_members
  add column phone_hash text,
  add column identity_code text,
  add column phone_attached_at timestamptz;

update public.group_members
set phone_hash = 'legacy:' || user_id::text,
    identity_code = 'LEGACY-' || upper(substr(replace(user_id::text, '-', ''), 1, 12))
where phone_hash is null;

alter table public.group_members
  alter column phone_hash set not null,
  alter column identity_code set not null,
  add constraint group_members_phone_hash_shape check (
    phone_hash ~ '^[0-9a-f]{64}$' or phone_hash ~ '^legacy:[0-9a-f-]{36}$'
  ),
  add constraint group_members_identity_code_shape check (
    identity_code ~ '^(SB-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}|LEGACY-[A-F0-9]{12})$'
  );

create unique index group_members_attached_phone_uniq
  on public.group_members (group_id, phone_hash)
  where phone_attached_at is not null;
create unique index group_members_identity_code_uniq
  on public.group_members (group_id, identity_code);

alter table public.markets
  add column subject_name text,
  add column subject_phone_hash text,
  add constraint markets_subject_complete check (
    (subject_name is null and subject_phone_hash is null)
    or (
      length(btrim(subject_name)) between 1 and 40
      and subject_phone_hash ~ '^[0-9a-f]{64}$'
    )
  );

create table public.market_participants (
  market_id uuid not null references public.markets(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (market_id, user_id)
);
create index market_participants_user_idx
  on public.market_participants (user_id, market_id);

insert into public.market_participants (market_id, user_id, joined_at)
select market_id, user_id, min(created_at)
from public.stakes
group by market_id, user_id
on conflict do nothing;

create function public.attach_member_phone(
  p_group_id uuid,
  p_user_id uuid,
  p_phone_hash text,
  p_identity_code text
)
returns void
language plpgsql
as $$
begin
  if p_phone_hash !~ '^[0-9a-f]{64}$'
    or p_identity_code !~ '^SB-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$' then
    raise exception 'invalid phone identity' using errcode = '22023';
  end if;

  update public.group_members
  set phone_hash = p_phone_hash,
      identity_code = p_identity_code,
      phone_attached_at = now()
  where group_id = p_group_id
    and user_id = p_user_id
    and phone_attached_at is null;
  if not found then
    raise exception 'phone identity is already attached or membership is missing'
      using errcode = '42501';
  end if;
end;
$$;

create function public.create_group_with_owner_phone(
  p_group_name text,
  p_link_id text,
  p_password_hash text,
  p_user_name text,
  p_admin_email text,
  p_recovery_code_hash text,
  p_phone_hash text,
  p_identity_code text,
  p_starting_points integer default 1000
)
returns jsonb
language plpgsql
as $$
declare v_group_id uuid; v_user_id uuid;
begin
  if length(btrim(coalesce(p_group_name, ''))) not between 1 and 60
    or length(btrim(coalesce(p_user_name, ''))) not between 1 and 40
    or length(btrim(coalesce(p_admin_email, ''))) not between 3 and 254
    or strpos(p_admin_email, '@') = 0
    or p_password_hash is null or p_recovery_code_hash is null
    or p_phone_hash !~ '^[0-9a-f]{64}$'
    or p_identity_code !~ '^SB-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$'
    or p_starting_points <= 0
  then raise exception 'invalid group entry' using errcode = '22023'; end if;

  insert into public.users (name, recovery_code_hash)
    values (btrim(p_user_name), p_recovery_code_hash) returning id into v_user_id;
  insert into public.groups (name, link_id, password_hash, created_by, admin_email)
    values (
      btrim(p_group_name), p_link_id, p_password_hash, v_user_id,
      lower(btrim(p_admin_email))
    ) returning id into v_group_id;
  insert into public.group_members (
    group_id, user_id, phone_hash, identity_code, phone_attached_at
  ) values (v_group_id, v_user_id, p_phone_hash, p_identity_code, now());
  insert into public.points_ledger (group_id, user_id, delta, reason)
    values (v_group_id, v_user_id, p_starting_points, 'allocation');
  return jsonb_build_object('group_id', v_group_id, 'user_id', v_user_id);
end;
$$;

create function public.join_group_member_phone(
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
declare v_user_id uuid;
begin
  if not exists (select 1 from public.groups where id = p_group_id)
    or length(btrim(coalesce(p_user_name, ''))) not between 1 and 40
    or p_recovery_code_hash is null
    or p_phone_hash !~ '^[0-9a-f]{64}$'
    or p_identity_code !~ '^SB-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$'
    or p_starting_points <= 0
  then raise exception 'invalid group entry' using errcode = '22023'; end if;

  insert into public.users (name, recovery_code_hash)
    values (btrim(p_user_name), p_recovery_code_hash) returning id into v_user_id;
  insert into public.group_members (
    group_id, user_id, phone_hash, identity_code, phone_attached_at
  ) values (p_group_id, v_user_id, p_phone_hash, p_identity_code, now());
  insert into public.points_ledger (group_id, user_id, delta, reason)
    values (p_group_id, v_user_id, p_starting_points, 'allocation');
  return v_user_id;
end;
$$;

create function public.create_group_with_owner_phone_imessage(
  p_token_hash text,
  p_group_name text,
  p_link_id text,
  p_password_hash text,
  p_user_name text,
  p_admin_email text,
  p_recovery_code_hash text,
  p_phone_hash text,
  p_identity_code text,
  p_starting_points integer default 1000
)
returns jsonb
language plpgsql
as $$
declare v_setup_group uuid; v_created jsonb;
begin
  select group_id into v_setup_group from public.imessage_setup_tokens
  where token_hash = p_token_hash and consumed_at is null and expires_at > now()
  for update;
  if not found then
    raise exception 'that iMessage setup link is invalid or expired' using errcode = '22023';
  end if;
  if v_setup_group is not null then
    raise exception 'this iMessage conversation is already linked to a Sidebar group'
      using errcode = '23505';
  end if;
  v_created := public.create_group_with_owner_phone(
    p_group_name, p_link_id, p_password_hash, p_user_name, p_admin_email,
    p_recovery_code_hash, p_phone_hash, p_identity_code, p_starting_points
  );
  perform public.consume_imessage_setup(
    p_token_hash, (v_created->>'group_id')::uuid, (v_created->>'user_id')::uuid
  );
  return v_created;
end;
$$;

create function public.join_group_member_phone_imessage(
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
declare v_setup_group uuid; v_user_id uuid;
begin
  select group_id into v_setup_group from public.imessage_setup_tokens
  where token_hash = p_token_hash and consumed_at is null and expires_at > now()
  for update;
  if not found then
    raise exception 'that iMessage setup link is invalid or expired' using errcode = '22023';
  end if;
  if v_setup_group is not null and v_setup_group is distinct from p_group_id then
    raise exception 'that iMessage setup link belongs to another Sidebar group'
      using errcode = '42501';
  end if;
  v_user_id := public.join_group_member_phone(
    p_group_id, p_user_name, p_recovery_code_hash,
    p_phone_hash, p_identity_code, p_starting_points
  );
  perform public.consume_imessage_setup(p_token_hash, p_group_id, v_user_id);
  return v_user_id;
end;
$$;

create or replace function public.open_market(
  p_group_id uuid,
  p_proposer_id uuid,
  p_question text,
  p_criteria text,
  p_reveal_at timestamptz,
  p_close_at timestamptz,
  p_resolve_at timestamptz,
  p_yes_label text default 'Yes',
  p_no_label text default 'No'
)
returns uuid
language plpgsql
as $$
declare
  v_market_id uuid;
  v_adjudicator_id uuid;
  v_next integer;
begin
  if not exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = p_proposer_id
  ) then
    raise exception 'not a member of this group' using errcode = '42501';
  end if;
  if btrim(coalesce(p_question, '')) = '' then
    raise exception 'question is required' using errcode = '22023';
  end if;
  select gm.user_id into v_adjudicator_id
  from public.group_members gm
  where gm.group_id = p_group_id
  order by (gm.user_id = p_proposer_id), random()
  limit 1;
  perform pg_advisory_xact_lock(hashtext(p_group_id::text));
  select coalesce(max(display_num), 0) + 1 into v_next
  from public.markets where group_id = p_group_id;
  insert into public.markets (
    group_id, display_num, kind, question, criteria, proposer_id,
    adjudicator_id, reveal_at, close_at, resolve_at
  ) values (
    p_group_id, v_next, 'native', btrim(p_question), btrim(p_criteria),
    p_proposer_id, v_adjudicator_id, p_reveal_at, p_close_at, p_resolve_at
  ) returning id into v_market_id;
  insert into public.market_sides (market_id, label, ordinal)
  values (v_market_id, p_yes_label, 0), (v_market_id, p_no_label, 1);
  return v_market_id;
end;
$$;

create function public.open_market_with_subject(
  p_group_id uuid,
  p_proposer_id uuid,
  p_question text,
  p_criteria text,
  p_reveal_at timestamptz,
  p_close_at timestamptz,
  p_resolve_at timestamptz,
  p_subject_name text default null,
  p_subject_phone_hash text default null,
  p_yes_label text default 'Yes',
  p_no_label text default 'No'
)
returns uuid
language plpgsql
as $$
declare v_market_id uuid; v_adjudicator_id uuid;
begin
  if not exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = p_proposer_id
      and phone_attached_at is not null
  ) then
    raise exception 'attach a phone identity before opening markets' using errcode = '42501';
  end if;
  if (p_subject_name is null) <> (p_subject_phone_hash is null) then
    raise exception 'subject name and phone are both required' using errcode = '22023';
  end if;
  if p_subject_name is not null and (
    length(btrim(p_subject_name)) not between 1 and 40
    or p_subject_phone_hash !~ '^[0-9a-f]{64}$'
  ) then raise exception 'invalid market subject' using errcode = '22023'; end if;

  v_market_id := public.open_market(
    p_group_id, p_proposer_id, p_question, p_criteria,
    p_reveal_at, p_close_at, p_resolve_at, p_yes_label, p_no_label
  );
  select gm.user_id into v_adjudicator_id
  from public.group_members gm
  where gm.group_id = p_group_id
    and gm.phone_attached_at is not null
    and (p_subject_phone_hash is null or gm.phone_hash <> p_subject_phone_hash)
  order by (gm.user_id = p_proposer_id), random()
  limit 1;
  update public.markets
  set subject_name = nullif(btrim(p_subject_name), ''),
      subject_phone_hash = p_subject_phone_hash,
      adjudicator_id = coalesce(v_adjudicator_id, adjudicator_id)
  where id = v_market_id;
  return v_market_id;
end;
$$;

create function public.join_market(p_market_id uuid, p_user_id uuid)
returns void
language plpgsql
as $$
declare v_group_id uuid; v_close_at timestamptz; v_resolved timestamptz; v_subject text;
begin
  select group_id, close_at, resolved_at, subject_phone_hash
    into v_group_id, v_close_at, v_resolved, v_subject
  from public.markets where id = p_market_id for update;
  if not found then raise exception 'no such market' using errcode = '22023'; end if;
  if v_resolved is not null or now() >= v_close_at then
    raise exception 'market is closed' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.group_members
    where group_id = v_group_id and user_id = p_user_id and phone_attached_at is not null
  ) then raise exception 'attach a phone identity before joining markets' using errcode = '42501'; end if;
  if v_subject is not null and exists (
    select 1 from public.group_members
    where group_id = v_group_id and user_id = p_user_id and phone_hash = v_subject
  ) then raise exception 'the market subject can view but cannot join or bet'
    using errcode = '42501'; end if;
  insert into public.market_participants (market_id, user_id)
  values (p_market_id, p_user_id) on conflict do nothing;
end;
$$;

create function public.leave_market(p_market_id uuid, p_user_id uuid)
returns void
language plpgsql
as $$
begin
  if exists (
    select 1 from public.stakes where market_id = p_market_id and user_id = p_user_id
  ) then raise exception 'a bettor cannot leave this market' using errcode = '23514'; end if;
  delete from public.market_participants
  where market_id = p_market_id and user_id = p_user_id;
end;
$$;

create or replace function public.place_stake(
  p_market_id uuid, p_side_id uuid, p_user_id uuid, p_amount integer
)
returns uuid language plpgsql as $$
declare
  v_group_id uuid;
  v_close_at timestamptz;
  v_resolved timestamptz;
  v_subject text;
  v_balance integer;
  v_stake_id uuid;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'stake must be positive' using errcode = '22023';
  end if;
  select group_id, close_at, resolved_at, subject_phone_hash
    into v_group_id, v_close_at, v_resolved, v_subject
  from public.markets where id = p_market_id for update;
  if not found then raise exception 'no such market' using errcode = '22023'; end if;
  if v_resolved is not null then raise exception 'market already resolved' using errcode = '22023'; end if;
  if now() >= v_close_at then raise exception 'market is closed' using errcode = '22023'; end if;
  if not exists (
    select 1 from public.market_sides where id = p_side_id and market_id = p_market_id
  ) then raise exception 'side does not belong to this market' using errcode = '22023'; end if;
  if not exists (
    select 1 from public.group_members where group_id = v_group_id and user_id = p_user_id
  ) then raise exception 'not a member of this group' using errcode = '42501'; end if;
  if v_subject is not null and exists (
    select 1 from public.group_members
    where group_id = v_group_id and user_id = p_user_id and phone_hash = v_subject
  ) then raise exception 'the market subject cannot bet' using errcode = '42501'; end if;

  -- Compatibility for the prior web deployment: placing a stake there joins
  -- the bettor atomically. New clients use place_stake_joined below.
  insert into public.market_participants (market_id, user_id)
  values (p_market_id, p_user_id) on conflict do nothing;

  perform pg_advisory_xact_lock(hashtext(v_group_id::text || ':' || p_user_id::text));
  select coalesce(sum(delta), 0)::integer into v_balance
  from public.points_ledger where group_id = v_group_id and user_id = p_user_id;
  if v_balance < p_amount then
    raise exception 'insufficient points: have %, staked %', v_balance, p_amount
      using errcode = '23514';
  end if;
  insert into public.stakes (market_id, side_id, user_id, amount)
  values (p_market_id, p_side_id, p_user_id, p_amount)
  returning id into v_stake_id;
  insert into public.points_ledger (group_id, user_id, delta, reason, market_id, stake_id)
  values (v_group_id, p_user_id, -p_amount, 'stake', p_market_id, v_stake_id);
  return v_stake_id;
end;
$$;

create function public.place_stake_joined(
  p_market_id uuid, p_side_id uuid, p_user_id uuid, p_amount integer
)
returns uuid
language plpgsql
as $$
begin
  if not exists (
    select 1 from public.market_participants
    where market_id = p_market_id and user_id = p_user_id
  ) then raise exception 'join this market before betting' using errcode = '42501'; end if;
  return public.place_stake(p_market_id, p_side_id, p_user_id, p_amount);
end;
$$;

alter table public.market_participants enable row level security;
revoke all on public.market_participants from public, anon, authenticated;
grant select, insert, update, delete on public.market_participants to service_role;

revoke all on function public.attach_member_phone(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.create_group_with_owner_phone(text, text, text, text, text, text, text, text, integer) from public, anon, authenticated;
revoke all on function public.join_group_member_phone(uuid, text, text, text, text, integer) from public, anon, authenticated;
revoke all on function public.create_group_with_owner_phone_imessage(text, text, text, text, text, text, text, text, text, integer) from public, anon, authenticated;
revoke all on function public.join_group_member_phone_imessage(text, uuid, text, text, text, text, integer) from public, anon, authenticated;
revoke all on function public.open_market_with_subject(uuid, uuid, text, text, timestamptz, timestamptz, timestamptz, text, text, text, text) from public, anon, authenticated;
revoke all on function public.join_market(uuid, uuid) from public, anon, authenticated;
revoke all on function public.leave_market(uuid, uuid) from public, anon, authenticated;
revoke all on function public.place_stake(uuid, uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.place_stake_joined(uuid, uuid, uuid, integer) from public, anon, authenticated;

grant execute on function public.attach_member_phone(uuid, uuid, text, text) to service_role;
grant execute on function public.create_group_with_owner_phone(text, text, text, text, text, text, text, text, integer) to service_role;
grant execute on function public.join_group_member_phone(uuid, text, text, text, text, integer) to service_role;
grant execute on function public.create_group_with_owner_phone_imessage(text, text, text, text, text, text, text, text, text, integer) to service_role;
grant execute on function public.join_group_member_phone_imessage(text, uuid, text, text, text, text, integer) to service_role;
grant execute on function public.open_market_with_subject(uuid, uuid, text, text, timestamptz, timestamptz, timestamptz, text, text, text, text) to service_role;
grant execute on function public.join_market(uuid, uuid) to service_role;
grant execute on function public.leave_market(uuid, uuid) to service_role;
grant execute on function public.place_stake(uuid, uuid, uuid, integer) to service_role;
grant execute on function public.place_stake_joined(uuid, uuid, uuid, integer) to service_role;

commit;
