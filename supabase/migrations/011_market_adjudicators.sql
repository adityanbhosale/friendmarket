-- Assign every market one eligible Sidebar-group member who alone may settle it.
-- Existing markets keep their previous behavior by assigning their proposer.

begin;

alter table public.markets
  add column adjudicator_id uuid references public.users(id);

update public.markets
set adjudicator_id = proposer_id
where adjudicator_id is null;

do $$
begin
  if exists (
    select 1
    from public.markets m
    left join public.group_members gm
      on gm.group_id = m.group_id and gm.user_id = m.adjudicator_id
    where gm.user_id is null
  ) then
    raise exception 'an existing market proposer is no longer a member of its group';
  end if;
end $$;

alter table public.markets
  alter column adjudicator_id set not null,
  add constraint markets_adjudicator_is_group_member
    foreign key (group_id, adjudicator_id)
    references public.group_members(group_id, user_id);

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

  -- Prefer another current member. A one-person group falls back to the
  -- proposer so a market can never be created without an adjudicator.
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

create or replace function public.resolve_market(
  p_market_id uuid,
  p_user_id uuid,
  p_outcome_side uuid
)
returns text
language plpgsql
as $$
declare
  v_group_id uuid;
  v_adjudicator uuid;
  v_resolved timestamptz;
  v_close_at timestamptz;
  v_resolve_at timestamptz;
  v_total integer;
  v_winning integer;
  v_reason text;
  r record;
begin
  select group_id, adjudicator_id, resolved_at, close_at, resolve_at
    into v_group_id, v_adjudicator, v_resolved, v_close_at, v_resolve_at
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
  if p_user_id is distinct from v_adjudicator then
    raise exception 'only the adjudicator can resolve this market' using errcode = '42501';
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

revoke all on function public.open_market(uuid, uuid, text, text, timestamptz, timestamptz, timestamptz, text, text)
  from public, anon, authenticated;
revoke all on function public.resolve_market(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.open_market(uuid, uuid, text, text, timestamptz, timestamptz, timestamptz, text, text)
  to service_role;
grant execute on function public.resolve_market(uuid, uuid, uuid)
  to service_role;

commit;
