-- Sidebar private-beta integrity fixes.
-- Run after 005. Forward-only and safe for existing valid native markets.

begin;

-- Native friend markets always have three distinct phases. Refuse to install
-- the stricter constraint if old rows need repair rather than hiding the issue.
do $$
begin
  if exists (
    select 1 from public.markets
    where kind = 'native'
      and not (reveal_at < close_at and close_at < resolve_at)
  ) then
    raise exception 'native markets violate reveal_at < close_at < resolve_at';
  end if;

  alter table public.markets drop constraint if exists markets_timeline_ordered;
  alter table public.markets add constraint markets_timeline_ordered
    check (kind <> 'native' or (reveal_at < close_at and close_at < resolve_at));
end $$;

-- A sealed view must not contain a value the application merely promises not
-- to render. Before reveal, only the overall participant count is available.
create or replace view public.market_pools_sealed with (security_invoker = true) as
select
  s.market_id,
  s.side_id,
  case when now() >= m.reveal_at then sum(s.amount)::integer end as pool,
  case when now() >= m.reveal_at then count(*)::integer end      as stake_count,
  now() >= m.reveal_at                                          as revealed
from public.stakes s
join public.markets m on m.id = s.market_id
group by s.market_id, s.side_id, m.reveal_at;

create or replace view public.market_totals with (security_invoker = true) as
select
  m.id as market_id,
  case when now() >= m.reveal_at
    then coalesce(sum(s.amount), 0)::integer
  end                                      as total_pool,
  count(distinct s.user_id)::integer       as participants,
  now() >= m.reveal_at                     as revealed
from public.markets m
left join public.stakes s on s.market_id = m.id
group by m.id, m.reveal_at;

-- close_at stops new stakes. resolve_at is the earliest instant settlement is
-- permitted. Keeping both checks makes the distinction enforceable in SQL.
create or replace function public.resolve_market(
  p_market_id    uuid,
  p_user_id      uuid,
  p_outcome_side uuid
)
returns text
language plpgsql
as $$
declare
  v_group_id  uuid;
  v_proposer  uuid;
  v_resolved  timestamptz;
  v_close_at  timestamptz;
  v_resolve_at timestamptz;
  v_total     integer;
  v_winning   integer;
  v_reason    text;
  r           record;
begin
  select group_id, proposer_id, resolved_at, close_at, resolve_at
    into v_group_id, v_proposer, v_resolved, v_close_at, v_resolve_at
  from public.markets where id = p_market_id
  for update;

  if not found then
    raise exception 'no such market' using errcode = '22023';
  end if;
  if v_resolved is not null then
    raise exception 'market already resolved' using errcode = '22023';
  end if;
  if now() < v_close_at then
    raise exception 'market has not closed yet' using errcode = '22023';
  end if;
  if now() < v_resolve_at then
    raise exception 'market is not ready to resolve yet' using errcode = '22023';
  end if;
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
    for r in
      select user_id, id as stake_id, amount
      from public.stakes where market_id = p_market_id
    loop
      insert into public.points_ledger (group_id, user_id, delta, reason, market_id, stake_id)
      values (v_group_id, r.user_id, r.amount, 'refund', p_market_id, r.stake_id);
    end loop;

    v_reason := case when p_outcome_side is null then 'ambiguous' else 'empty_side' end;
    update public.markets
    set resolved_at = now(), resolved_by = p_user_id,
        outcome_side = p_outcome_side, void_reason = v_reason
    where id = p_market_id;
    return v_reason;
  end if;

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
  set resolved_at = now(), resolved_by = p_user_id,
      outcome_side = p_outcome_side, void_reason = null
  where id = p_market_id;
  return 'resolved';
end;
$$;

revoke all on public.market_pools_sealed from public, anon, authenticated;
revoke all on public.market_totals from public, anon, authenticated;
revoke all on function public.points_balance(uuid, uuid) from public, anon, authenticated;
revoke all on function public.open_market(uuid, uuid, text, text, timestamptz, timestamptz, timestamptz, text, text) from public, anon, authenticated;
revoke all on function public.place_stake(uuid, uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.resolve_market(uuid, uuid, uuid) from public, anon, authenticated;

grant select on public.market_pools_sealed, public.market_totals to service_role;
grant execute on function public.points_balance(uuid, uuid) to service_role;
grant execute on function public.open_market(uuid, uuid, text, text, timestamptz, timestamptz, timestamptz, text, text) to service_role;
grant execute on function public.place_stake(uuid, uuid, uuid, integer) to service_role;
grant execute on function public.resolve_market(uuid, uuid, uuid) to service_role;

commit;
