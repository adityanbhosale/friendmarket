-- open_market() inserted kind = 'binary', which your existing markets_kind_check
-- constraint rejects. Probing the constraint showed it accepts 'native' — the
-- right label anyway for a market the group opened itself, as against one
-- sourced from an external slate (which is what slate_source_id is for).
--
-- Fixed forward rather than by editing 002, since 002 has already been run.
-- Run this in the Supabase SQL editor.

begin;

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

revoke all on function public.open_market(uuid, uuid, text, text, timestamptz, timestamptz, timestamptz, text, text)
  from anon, authenticated;

commit;
