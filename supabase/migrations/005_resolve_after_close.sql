-- resolve_market() never checked close_at, so the proposer could settle a market
-- while it was still open and people were staking into it. Combined with
-- proposer-resolves, that lets whoever opened a market watch the pool build and
-- then settle early on the side they are holding. Rulebook section 9 puts
-- resolution strictly after close for this reason.
--
-- The guard covers voiding too, not just declaring an outcome. A void refunds
-- every stake at face value, which sounds harmless — but for a proposer whose
-- own position is losing it is a free option to cancel the bet and get their
-- stake back. Early void is the same exploit wearing a different hat.
--
-- The UI already only offered the resolve form on a closed market. This makes
-- that rule real rather than a matter of which form you can reach.
--
-- Supersedes the resolve_market in 002 and 004. Run in the Supabase SQL editor.

begin;

create or replace function public.resolve_market(
  p_market_id    uuid,
  p_user_id      uuid,
  p_outcome_side uuid
)
returns text
language plpgsql
as $$
declare
  v_group_id uuid;
  v_proposer uuid;
  v_resolved timestamptz;
  v_close_at timestamptz;
  v_total    integer;
  v_winning  integer;
  v_reason   text;
  r          record;
begin
  select group_id, proposer_id, resolved_at, close_at
    into v_group_id, v_proposer, v_resolved, v_close_at
  from public.markets where id = p_market_id
  for update;

  if not found then
    raise exception 'no such market' using errcode = '22023';
  end if;
  if v_resolved is not null then
    raise exception 'market already resolved' using errcode = '22023';
  end if;

  -- Nothing settles while the book is still open.
  if now() < v_close_at then
    raise exception 'market has not closed yet' using errcode = '22023';
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
    v_reason := case when p_outcome_side is null then 'ambiguous' else 'empty_side' end;

    update public.markets
    set resolved_at = now(),
        resolved_by = p_user_id,
        outcome_side = p_outcome_side,
        void_reason  = v_reason
    where id = p_market_id;

    return v_reason;
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

revoke all on function public.resolve_market(uuid, uuid, uuid) from anon, authenticated;

commit;
