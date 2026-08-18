-- resolve_market() wrote void_reason values ('void_empty_winning_side' etc.)
-- that your markets_void_reason_check constraint rejects. Probing showed it
-- accepts 'empty_side' and 'ambiguous', which map onto the rulebook's cases:
--
--   nobody staked at all            -> empty_side
--   nobody backed the winning side  -> empty_side   (rulebook: zero-pool void)
--   no outcome declared             -> ambiguous
--
-- The UI tells the first two apart by whether the total pool is zero, so no
-- information is lost by sharing a label.
--
-- Run this in the Supabase SQL editor.

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
  v_total    integer;
  v_winning  integer;
  v_reason   text;
  r          record;
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
