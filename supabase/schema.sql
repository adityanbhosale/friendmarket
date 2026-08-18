-- Sidebar canonical schema for a NEW Supabase project.
-- Do not run this file against an existing database. Existing projects advance
-- through supabase/migrations in numeric order instead.

begin;

create extension if not exists pgcrypto;

create table public.users (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 40),
  email text,
  phone text,
  recovery_code_hash text,
  created_at timestamptz not null default now()
);
create unique index users_recovery_code_hash_uniq
  on public.users (recovery_code_hash) where recovery_code_hash is not null;

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 60),
  link_id text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table public.markets (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  display_num integer not null check (display_num > 0),
  kind text not null default 'native' check (kind = 'native'),
  question text not null check (length(btrim(question)) between 1 and 200),
  criteria text not null check (length(btrim(criteria)) between 1 and 500),
  proposer_id uuid not null references public.users(id),
  reveal_at timestamptz not null,
  close_at timestamptz not null,
  resolve_at timestamptz not null,
  outcome_side uuid,
  void_reason text check (void_reason in ('empty_side', 'ambiguous')),
  resolved_at timestamptz,
  resolved_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  constraint markets_timeline_ordered
    check (reveal_at < close_at and close_at < resolve_at),
  unique (group_id, display_num)
);

create table public.market_sides (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references public.markets(id) on delete cascade,
  label text not null check (length(btrim(label)) between 1 and 80),
  ordinal integer not null check (ordinal in (0, 1)),
  unique (market_id, id),
  unique (market_id, ordinal)
);

alter table public.markets add constraint markets_outcome_side_belongs_to_market
  foreign key (id, outcome_side)
  references public.market_sides(market_id, id);

create table public.stakes (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references public.markets(id) on delete cascade,
  side_id uuid not null,
  user_id uuid not null references public.users(id) on delete cascade,
  amount integer not null check (amount > 0),
  created_at timestamptz not null default now(),
  foreign key (market_id, side_id)
    references public.market_sides(market_id, id)
);
create index stakes_market_idx on public.stakes (market_id);
create index stakes_user_idx on public.stakes (user_id);

create table public.points_ledger (
  id bigint generated always as identity primary key,
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  delta integer not null,
  reason text not null check (reason in ('allocation', 'stake', 'payout', 'refund')),
  market_id uuid references public.markets(id) on delete set null,
  stake_id uuid references public.stakes(id) on delete set null,
  created_at timestamptz not null default now()
);
create index points_ledger_balance_idx on public.points_ledger (group_id, user_id);
create unique index points_ledger_one_allocation_idx
  on public.points_ledger (group_id, user_id) where reason = 'allocation';

create table public.signups (
  id bigint generated always as identity primary key,
  name text not null check (length(btrim(name)) between 1 and 40),
  name_key text generated always as (lower(btrim(name))) stored,
  created_at timestamptz not null default now()
);
create unique index signups_name_key_uniq on public.signups (name_key);

create table public.join_attempts (
  id bigint generated always as identity primary key,
  link_id text not null,
  client_hash text not null,
  method text not null default 'password' check (method in ('password', 'recovery')),
  succeeded boolean not null default false,
  attempted_at timestamptz not null default now()
);
create index join_attempts_lookup_idx
  on public.join_attempts (link_id, client_hash, method, attempted_at desc);

-- Optional transport attachment. A normal Sidebar group has no row here.
create table public.imessage_conversations (
  conversation_hash text primary key check (conversation_hash ~ '^[0-9a-f]{64}$'),
  group_id uuid not null references public.groups(id) on delete cascade,
  created_by uuid not null references public.users(id),
  created_at timestamptz not null default now()
);
create index imessage_conversations_group_idx on public.imessage_conversations (group_id);

create table public.imessage_identities (
  conversation_hash text not null references public.imessage_conversations(conversation_hash) on delete cascade,
  sender_hash text not null check (sender_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (conversation_hash, sender_hash),
  unique (conversation_hash, user_id)
);

create table public.imessage_setup_tokens (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  conversation_hash text not null check (conversation_hash ~ '^[0-9a-f]{64}$'),
  sender_hash text not null check (sender_hash ~ '^[0-9a-f]{64}$'),
  group_id uuid references public.groups(id) on delete cascade,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);
create index imessage_setup_tokens_expiry_idx on public.imessage_setup_tokens (expires_at)
  where consumed_at is null;

create view public.market_pools_sealed with (security_invoker = true) as
select
  s.market_id,
  s.side_id,
  case when now() >= m.reveal_at then sum(s.amount)::integer end as pool,
  case when now() >= m.reveal_at then count(*)::integer end as stake_count,
  now() >= m.reveal_at as revealed
from public.stakes s
join public.markets m on m.id = s.market_id
group by s.market_id, s.side_id, m.reveal_at;

create view public.market_totals with (security_invoker = true) as
select
  m.id as market_id,
  case when now() >= m.reveal_at
    then coalesce(sum(s.amount), 0)::integer
  end as total_pool,
  count(distinct s.user_id)::integer as participants,
  now() >= m.reveal_at as revealed
from public.markets m
left join public.stakes s on s.market_id = m.id
group by m.id, m.reveal_at;

create function public.points_balance(p_group_id uuid, p_user_id uuid)
returns integer language sql stable as $$
  select coalesce(sum(delta), 0)::integer
  from public.points_ledger
  where group_id = p_group_id and user_id = p_user_id;
$$;

create function public.open_market(
  p_group_id uuid, p_proposer_id uuid, p_question text, p_criteria text,
  p_reveal_at timestamptz, p_close_at timestamptz, p_resolve_at timestamptz,
  p_yes_label text default 'Yes', p_no_label text default 'No'
)
returns uuid language plpgsql as $$
declare
  v_market_id uuid;
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

  perform pg_advisory_xact_lock(hashtext(p_group_id::text));
  select coalesce(max(display_num), 0) + 1 into v_next
  from public.markets where group_id = p_group_id;

  insert into public.markets (
    group_id, display_num, kind, question, criteria, proposer_id,
    reveal_at, close_at, resolve_at
  ) values (
    p_group_id, v_next, 'native', btrim(p_question), btrim(p_criteria),
    p_proposer_id, p_reveal_at, p_close_at, p_resolve_at
  ) returning id into v_market_id;

  insert into public.market_sides (market_id, label, ordinal)
  values (v_market_id, p_yes_label, 0), (v_market_id, p_no_label, 1);
  return v_market_id;
end;
$$;

create function public.place_stake(
  p_market_id uuid, p_side_id uuid, p_user_id uuid, p_amount integer
)
returns uuid language plpgsql as $$
declare
  v_group_id uuid;
  v_close_at timestamptz;
  v_resolved timestamptz;
  v_balance integer;
  v_stake_id uuid;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'stake must be positive' using errcode = '22023';
  end if;
  select group_id, close_at, resolved_at
    into v_group_id, v_close_at, v_resolved
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

create function public.resolve_market(
  p_market_id uuid, p_user_id uuid, p_outcome_side uuid
)
returns text language plpgsql as $$
declare
  v_group_id uuid;
  v_proposer uuid;
  v_resolved timestamptz;
  v_close_at timestamptz;
  v_resolve_at timestamptz;
  v_total integer;
  v_winning integer;
  v_reason text;
  r record;
begin
  select group_id, proposer_id, resolved_at, close_at, resolve_at
    into v_group_id, v_proposer, v_resolved, v_close_at, v_resolve_at
  from public.markets where id = p_market_id for update;
  if not found then raise exception 'no such market' using errcode = '22023'; end if;
  if v_resolved is not null then raise exception 'market already resolved' using errcode = '22023'; end if;
  if now() < v_close_at then raise exception 'market has not closed yet' using errcode = '22023'; end if;
  if now() < v_resolve_at then raise exception 'market is not ready to resolve yet' using errcode = '22023'; end if;
  if p_user_id is distinct from v_proposer then
    raise exception 'only the proposer can resolve this market' using errcode = '42501';
  end if;
  if p_outcome_side is not null and not exists (
    select 1 from public.market_sides where id = p_outcome_side and market_id = p_market_id
  ) then raise exception 'side does not belong to this market' using errcode = '22023'; end if;

  select coalesce(sum(amount), 0)::integer into v_total
  from public.stakes where market_id = p_market_id;
  select coalesce(sum(amount), 0)::integer into v_winning
  from public.stakes where market_id = p_market_id and side_id = p_outcome_side;

  if v_total = 0 or p_outcome_side is null or v_winning = 0 then
    for r in select user_id, id as stake_id, amount from public.stakes where market_id = p_market_id
    loop
      insert into public.points_ledger (group_id, user_id, delta, reason, market_id, stake_id)
      values (v_group_id, r.user_id, r.amount, 'refund', p_market_id, r.stake_id);
    end loop;
    v_reason := case when p_outcome_side is null then 'ambiguous' else 'empty_side' end;
    update public.markets set resolved_at = now(), resolved_by = p_user_id,
      outcome_side = p_outcome_side, void_reason = v_reason where id = p_market_id;
    return v_reason;
  end if;

  for r in
    select user_id, id as stake_id, amount from public.stakes
    where market_id = p_market_id and side_id = p_outcome_side
  loop
    insert into public.points_ledger (group_id, user_id, delta, reason, market_id, stake_id)
    values (v_group_id, r.user_id,
      floor(v_total::numeric * r.amount / v_winning)::integer,
      'payout', p_market_id, r.stake_id);
  end loop;
  update public.markets set resolved_at = now(), resolved_by = p_user_id,
    outcome_side = p_outcome_side, void_reason = null where id = p_market_id;
  return 'resolved';
end;
$$;

create function public.create_group_with_owner(
  p_group_name text, p_link_id text, p_password_hash text, p_user_name text,
  p_recovery_code_hash text, p_starting_points integer default 1000
)
returns jsonb language plpgsql as $$
declare v_group_id uuid; v_user_id uuid;
begin
  if length(btrim(coalesce(p_group_name, ''))) not between 1 and 60
    or length(btrim(coalesce(p_user_name, ''))) not between 1 and 40
    or p_password_hash is null or p_recovery_code_hash is null
    or p_starting_points <= 0
  then raise exception 'invalid group entry' using errcode = '22023'; end if;
  insert into public.groups (name, link_id, password_hash)
    values (btrim(p_group_name), p_link_id, p_password_hash) returning id into v_group_id;
  insert into public.users (name, recovery_code_hash)
    values (btrim(p_user_name), p_recovery_code_hash) returning id into v_user_id;
  insert into public.group_members (group_id, user_id) values (v_group_id, v_user_id);
  insert into public.points_ledger (group_id, user_id, delta, reason)
    values (v_group_id, v_user_id, p_starting_points, 'allocation');
  return jsonb_build_object('group_id', v_group_id, 'user_id', v_user_id);
end;
$$;

create function public.join_group_member(
  p_group_id uuid, p_user_name text, p_recovery_code_hash text,
  p_starting_points integer default 1000
)
returns uuid language plpgsql as $$
declare v_user_id uuid;
begin
  if not exists (select 1 from public.groups where id = p_group_id)
    or length(btrim(coalesce(p_user_name, ''))) not between 1 and 40
    or p_recovery_code_hash is null or p_starting_points <= 0
  then raise exception 'invalid group entry' using errcode = '22023'; end if;
  insert into public.users (name, recovery_code_hash)
    values (btrim(p_user_name), p_recovery_code_hash) returning id into v_user_id;
  insert into public.group_members (group_id, user_id) values (p_group_id, v_user_id);
  insert into public.points_ledger (group_id, user_id, delta, reason)
    values (p_group_id, v_user_id, p_starting_points, 'allocation');
  return v_user_id;
end;
$$;

create function public.set_recovery_code(
  p_group_id uuid, p_user_id uuid, p_recovery_code_hash text
)
returns void language plpgsql as $$
begin
  if not exists (
    select 1 from public.group_members where group_id = p_group_id and user_id = p_user_id
  ) then raise exception 'not a member of this group' using errcode = '42501'; end if;
  if p_recovery_code_hash is null then
    raise exception 'recovery code is required' using errcode = '22023';
  end if;
  update public.users set recovery_code_hash = p_recovery_code_hash where id = p_user_id;
end;
$$;

create function public.consume_imessage_setup(
  p_token_hash text, p_group_id uuid, p_user_id uuid
)
returns void language plpgsql as $$
declare
  v_setup public.imessage_setup_tokens%rowtype;
  v_existing_group uuid;
  v_existing_user uuid;
begin
  select * into v_setup from public.imessage_setup_tokens
  where token_hash = p_token_hash for update;
  if not found or v_setup.consumed_at is not null or v_setup.expires_at <= now() then
    raise exception 'that iMessage setup link is invalid or expired' using errcode = '22023';
  end if;
  if v_setup.group_id is not null and v_setup.group_id is distinct from p_group_id then
    raise exception 'that iMessage setup link belongs to another Sidebar group' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.group_members where group_id = p_group_id and user_id = p_user_id
  ) then raise exception 'not a member of this group' using errcode = '42501'; end if;

  insert into public.imessage_conversations (conversation_hash, group_id, created_by)
  values (v_setup.conversation_hash, p_group_id, p_user_id)
  on conflict (conversation_hash) do nothing;
  select group_id into v_existing_group from public.imessage_conversations
  where conversation_hash = v_setup.conversation_hash;
  if v_existing_group is distinct from p_group_id then
    raise exception 'this iMessage conversation is already linked to another Sidebar group'
      using errcode = '23505';
  end if;

  insert into public.imessage_identities (conversation_hash, sender_hash, user_id)
  values (v_setup.conversation_hash, v_setup.sender_hash, p_user_id)
  on conflict (conversation_hash, sender_hash) do nothing;
  select user_id into v_existing_user from public.imessage_identities
  where conversation_hash = v_setup.conversation_hash and sender_hash = v_setup.sender_hash;
  if v_existing_user is distinct from p_user_id then
    raise exception 'this iMessage sender is already linked to another member'
      using errcode = '23505';
  end if;
  update public.imessage_setup_tokens set consumed_at = now()
  where token_hash = p_token_hash;
end;
$$;

create function public.create_group_with_owner_imessage(
  p_token_hash text, p_group_name text, p_link_id text, p_password_hash text,
  p_user_name text, p_recovery_code_hash text, p_starting_points integer default 1000
)
returns jsonb language plpgsql as $$
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
  v_created := public.create_group_with_owner(
    p_group_name, p_link_id, p_password_hash, p_user_name,
    p_recovery_code_hash, p_starting_points
  );
  perform public.consume_imessage_setup(
    p_token_hash, (v_created->>'group_id')::uuid, (v_created->>'user_id')::uuid
  );
  return v_created;
end;
$$;

create function public.join_group_member_imessage(
  p_token_hash text, p_group_id uuid, p_user_name text,
  p_recovery_code_hash text, p_starting_points integer default 1000
)
returns uuid language plpgsql as $$
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
  v_user_id := public.join_group_member(
    p_group_id, p_user_name, p_recovery_code_hash, p_starting_points
  );
  perform public.consume_imessage_setup(p_token_hash, p_group_id, v_user_id);
  return v_user_id;
end;
$$;

do $$
declare rel record;
begin
  for rel in select tablename from pg_tables where schemaname = 'public'
  loop execute format('alter table public.%I enable row level security', rel.tablename); end loop;
end $$;

revoke all on all tables in schema public from public, anon, authenticated;
revoke all on all sequences in schema public from public, anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke all on tables from public, anon, authenticated;
alter default privileges in schema public revoke all on sequences from public, anon, authenticated;
alter default privileges in schema public revoke all on functions from public, anon, authenticated;

grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

commit;
