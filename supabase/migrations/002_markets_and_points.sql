-- Sidebar — points ledger, market lifecycle, and the atomic operations.
-- Run after 001. Safe to run more than once.
--
-- Design notes:
--
-- * `stakes` is the source of truth for pools. Anything that reports a pool
--   derives it from stakes rather than trusting a stored total.
-- * Staking and resolving are Postgres functions, not application code. Both
--   need to read a balance and write several rows atomically, and PostgREST
--   gives no transaction across separate requests — two concurrent stakes would
--   otherwise both pass a balance check and overdraw the account.
-- * SECURITY INVOKER (the default) on purpose. The app calls these with the
--   secret key, which already bypasses RLS; SECURITY DEFINER would add an
--   escalation path for no benefit.

begin;

-- ---------------------------------------------------------------------------
-- 1. Points ledger
-- ---------------------------------------------------------------------------
-- Balance is derived, never stored. Every movement keeps its reason, so a
-- disputed settlement can be reconstructed line by line instead of argued from
-- a single mutable integer.

create table if not exists public.points_ledger (
  id         bigint generated always as identity primary key,
  group_id   uuid        not null references public.groups(id)  on delete cascade,
  user_id    uuid        not null references public.users(id)   on delete cascade,
  delta      integer     not null,
  reason     text        not null check (reason in ('allocation','stake','payout','refund')),
  market_id  uuid        references public.markets(id) on delete set null,
  stake_id   uuid        references public.stakes(id)  on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists points_ledger_balance_idx
  on public.points_ledger (group_id, user_id);

-- One allocation per person per group, enforced rather than trusted.
create unique index if not exists points_ledger_one_allocation_idx
  on public.points_ledger (group_id, user_id)
  where reason = 'allocation';

alter table public.points_ledger enable row level security;

create or replace function public.points_balance(p_group_id uuid, p_user_id uuid)
returns integer
language sql
stable
as $$
  select coalesce(sum(delta), 0)::integer
  from public.points_ledger
  where group_id = p_group_id and user_id = p_user_id;
$$;

-- ---------------------------------------------------------------------------
-- 2. Market integrity
-- ---------------------------------------------------------------------------

-- Who actually settled it. The proposer resolves their own market and may also
-- hold a stake in it, so the record of who pressed the button matters.
alter table public.markets add column if not exists resolved_by uuid references public.users(id);

-- Per-group market numbering. Assigned inside open_market() under a lock.
create unique index if not exists markets_group_display_num_idx
  on public.markets (group_id, display_num);

-- A zero or negative stake is not a stake.
do $$
begin
  alter table public.stakes add constraint stakes_amount_positive check (amount > 0);
exception
  when duplicate_object then null;
end $$;

-- Timestamps must describe a real lifecycle: seed, then reveal, then close.
do $$
begin
  alter table public.markets add constraint markets_timeline_ordered
    check (reveal_at <= close_at and close_at <= resolve_at);
exception
  when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Pools, sealed
-- ---------------------------------------------------------------------------
-- Rulebook section 4: seeding stakes are placed blind. This view returns NULL
-- for a market before reveal_at, so a careless SELECT cannot leak a sealed pool
-- — the seal holds even against someone reading the network tab.

-- 001 created this view over market_pools with an implied_prob column. The
-- definition below derives from stakes instead and drops that column, and
-- CREATE OR REPLACE VIEW can only append columns — never rename, reorder, or
-- remove them. So it has to go first.
drop view if exists public.market_pools_sealed;

-- security_invoker: the view runs with the caller's privileges, so RLS on
-- stakes and markets still applies through it. Without this a view is a hole
-- straight past RLS for anyone who is ever granted select on it.
create view public.market_pools_sealed with (security_invoker = true) as
select
  s.market_id,
  s.side_id,
  case when now() >= m.reveal_at then sum(s.amount)::integer end as pool,
  count(*)::integer                                              as stake_count,
  now() >= m.reveal_at                                           as revealed
from public.stakes s
join public.markets m on m.id = s.market_id
group by s.market_id, s.side_id, m.reveal_at;

-- Totals that are safe to show while sealed: how many people are in, never how
-- much is on which side.
drop view if exists public.market_totals;

create view public.market_totals with (security_invoker = true) as
select
  m.id                                as market_id,
  coalesce(sum(s.amount), 0)::integer as total_pool,
  count(distinct s.user_id)::integer  as participants,
  now() >= m.reveal_at                as revealed
from public.markets m
left join public.stakes s on s.market_id = m.id
group by m.id, m.reveal_at;

-- ---------------------------------------------------------------------------
-- 4. Open a market
-- ---------------------------------------------------------------------------
-- display_num is assigned here rather than in application code so two people
-- opening a market at once cannot claim the same number.

create or replace function public.open_market(
  p_group_id    uuid,
  p_proposer_id uuid,
  p_question    text,
  p_criteria    text,
  p_reveal_at   timestamptz,
  p_close_at    timestamptz,
  p_resolve_at  timestamptz,
  p_yes_label   text default 'Yes',
  p_no_label    text default 'No'
)
returns uuid
language plpgsql
as $$
declare
  v_market_id uuid;
  v_next      integer;
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

  -- Serialises numbering against concurrent opens in the same group.
  perform pg_advisory_xact_lock(hashtext(p_group_id::text));

  select coalesce(max(display_num), 0) + 1 into v_next
  from public.markets where group_id = p_group_id;

  insert into public.markets (
    group_id, display_num, kind, question, criteria,
    proposer_id, reveal_at, close_at, resolve_at
  )
  values (
    p_group_id, v_next, 'native', btrim(p_question), btrim(coalesce(p_criteria, '')),
    p_proposer_id, p_reveal_at, p_close_at, p_resolve_at
  )
  returning id into v_market_id;

  insert into public.market_sides (market_id, label, ordinal)
  values (v_market_id, p_yes_label, 0), (v_market_id, p_no_label, 1);

  return v_market_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Place a stake
-- ---------------------------------------------------------------------------
-- Everything a stake must be true about — membership, the trading window, the
-- balance — is checked here, in one transaction with the writes. Application
-- code cannot skip it and a race cannot slip between check and write.

create or replace function public.place_stake(
  p_market_id uuid,
  p_side_id   uuid,
  p_user_id   uuid,
  p_amount    integer
)
returns uuid
language plpgsql
as $$
declare
  v_group_id uuid;
  v_close_at timestamptz;
  v_resolved timestamptz;
  v_balance  integer;
  v_stake_id uuid;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'stake must be positive' using errcode = '22023';
  end if;

  select group_id, close_at, resolved_at
    into v_group_id, v_close_at, v_resolved
  from public.markets where id = p_market_id
  for update;

  if not found then
    raise exception 'no such market' using errcode = '22023';
  end if;
  if v_resolved is not null then
    raise exception 'market already resolved' using errcode = '22023';
  end if;
  if now() >= v_close_at then
    raise exception 'market is closed' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.market_sides where id = p_side_id and market_id = p_market_id
  ) then
    raise exception 'side does not belong to this market' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.group_members
    where group_id = v_group_id and user_id = p_user_id
  ) then
    raise exception 'not a member of this group' using errcode = '42501';
  end if;

  -- Serialises this member's stakes against each other, so two simultaneous
  -- stakes cannot both read the same balance and overdraw it.
  --
  -- An advisory lock rather than SELECT ... FOR UPDATE: Postgres rejects row
  -- locking combined with an aggregate, and FOR UPDATE would in any case lock
  -- only the rows that already exist — not the gap where a concurrent insert
  -- is about to land.
  perform pg_advisory_xact_lock(hashtext(v_group_id::text || ':' || p_user_id::text));

  select coalesce(sum(delta), 0)::integer into v_balance
  from public.points_ledger
  where group_id = v_group_id and user_id = p_user_id;

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

-- ---------------------------------------------------------------------------
-- 6. Resolve a market
-- ---------------------------------------------------------------------------
-- Parimutuel settlement: the whole pool splits across the winning side in
-- proportion to each stake. Two cases void instead of paying:
--   * nobody staked at all
--   * nobody staked the side that actually happened  (rulebook: zero-pool void)
-- Both refund every stake at face value.

create or replace function public.resolve_market(
  p_market_id    uuid,
  p_user_id      uuid,
  p_outcome_side uuid
)
returns text
language plpgsql
as $$
declare
  v_group_id    uuid;
  v_proposer    uuid;
  v_resolved    timestamptz;
  v_total       integer;
  v_winning     integer;
  v_outcome     text;
  r             record;
begin
  select group_id, proposer_id, resolved_at
    into v_group_id, v_proposer, v_resolved
  from public.markets where id = p_market_id
  for update;

  if not found then
    raise exception 'no such market' using errcode = '22023';
  end if;
  if v_resolved is not null then
    raise exception 'market already resolved' using errcode = '22023';
  end if;

  -- The proposer settles their own market. They may also hold a stake in it, so
  -- resolved_by is recorded to make that visible after the fact.
  if p_user_id is distinct from v_proposer then
    raise exception 'only the proposer can resolve this market' using errcode = '42501';
  end if;

  if p_outcome_side is not null and not exists (
    select 1 from public.market_sides where id = p_outcome_side and market_id = p_market_id
  ) then
    raise exception 'side does not belong to this market' using errcode = '22023';
  end if;

  select coalesce(sum(amount), 0)::integer into v_total
  from public.stakes where market_id = p_market_id;

  select coalesce(sum(amount), 0)::integer into v_winning
  from public.stakes where market_id = p_market_id and side_id = p_outcome_side;

  if v_total = 0 or p_outcome_side is null or v_winning = 0 then
    -- Void. Refund every stake; nobody wins and nobody loses.
    for r in
      select user_id, id as stake_id, amount
      from public.stakes where market_id = p_market_id
    loop
      insert into public.points_ledger (group_id, user_id, delta, reason, market_id, stake_id)
      values (v_group_id, r.user_id, r.amount, 'refund', p_market_id, r.stake_id);
    end loop;

    -- Constrained by markets_void_reason_check to 'empty_side' / 'ambiguous'.
    v_outcome := case when p_outcome_side is null then 'ambiguous' else 'empty_side' end;

    update public.markets
    set resolved_at = now(),
        resolved_by = p_user_id,
        outcome_side = p_outcome_side,
        void_reason  = v_outcome
    where id = p_market_id;

    return v_outcome;
  end if;

  -- Proportional payout, floored. Points are integers, so a few units of dust
  -- can remain unallocated rather than being invented to round up.
  for r in
    select user_id, id as stake_id, amount
    from public.stakes
    where market_id = p_market_id and side_id = p_outcome_side
  loop
    insert into public.points_ledger (group_id, user_id, delta, reason, market_id, stake_id)
    values (
      v_group_id, r.user_id,
      floor(v_total::numeric * r.amount / v_winning)::integer,
      'payout', p_market_id, r.stake_id
    );
  end loop;

  update public.markets
  set resolved_at = now(),
      resolved_by = p_user_id,
      outcome_side = p_outcome_side
  where id = p_market_id;

  return 'resolved';
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Nothing above is reachable without the secret key.
-- ---------------------------------------------------------------------------

revoke all on public.points_ledger        from anon, authenticated;
revoke all on public.market_pools_sealed  from anon, authenticated;
revoke all on public.market_totals        from anon, authenticated;
revoke all on function public.points_balance(uuid, uuid)               from anon, authenticated;
revoke all on function public.open_market(uuid, uuid, text, text, timestamptz, timestamptz, timestamptz, text, text) from anon, authenticated;
revoke all on function public.place_stake(uuid, uuid, uuid, integer)   from anon, authenticated;
revoke all on function public.resolve_market(uuid, uuid, uuid)         from anon, authenticated;

commit;
