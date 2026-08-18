-- Run against a disposable database after supabase/schema.sql, or against a
-- staging database after all migrations. Every test row is rolled back.

begin;

do $$
declare
  v_created jsonb;
  v_group uuid;
  v_owner uuid;
  v_member uuid;
  v_imessage_member uuid;
  v_market uuid;
  v_yes uuid;
  v_no uuid;
  v_before integer;
  v_after integer;
  v_failed boolean := false;
begin
  v_created := public.create_group_with_owner(
    'Invariant test', 'TEST-BETA', 'test-password-hash', 'Owner',
    'owner@example.com', repeat('a', 64), 1000
  );
  v_group := (v_created->>'group_id')::uuid;
  v_owner := (v_created->>'user_id')::uuid;
  v_member := public.join_group_member(v_group, 'Member', repeat('b', 64), 1000);

  insert into public.imessage_setup_tokens (
    token_hash, conversation_hash, sender_hash, group_id, expires_at
  ) values (
    repeat('c', 64), repeat('d', 64), repeat('e', 64), v_group,
    now() + interval '15 minutes'
  );
  perform public.consume_imessage_setup(repeat('c', 64), v_group, v_owner);
  if not exists (
    select 1 from public.imessage_conversations
    where conversation_hash = repeat('d', 64) and group_id = v_group
  ) or not exists (
    select 1 from public.imessage_identities
    where conversation_hash = repeat('d', 64)
      and sender_hash = repeat('e', 64) and user_id = v_owner
  ) then
    raise exception 'optional iMessage binding was not created';
  end if;

  insert into public.imessage_setup_tokens (
    token_hash, conversation_hash, sender_hash, expires_at
  ) values (
    repeat('f', 64), repeat('1', 64), repeat('2', 64),
    now() + interval '15 minutes'
  );
  v_imessage_member := public.join_group_member_imessage(
    repeat('f', 64), v_group, 'iMessage member', repeat('3', 64), 1000
  );
  if not exists (
    select 1 from public.imessage_identities
    where conversation_hash = repeat('1', 64)
      and sender_hash = repeat('2', 64) and user_id = v_imessage_member
  ) then
    raise exception 'unbound iMessage conversation did not join an existing group';
  end if;

  if public.points_balance(v_group, v_owner) <> 1000
    or public.points_balance(v_group, v_member) <> 1000 then
    raise exception 'starting allocations are incorrect';
  end if;

  select count(*) into v_before from public.users;
  begin
    perform public.join_group_member(v_group, 'Collision', repeat('a', 64), 1000);
  exception when unique_violation then
    v_failed := true;
  end;
  select count(*) into v_after from public.users;
  if not v_failed or v_after <> v_before then
    raise exception 'failed atomic join left a partial user';
  end if;

  v_market := public.open_market(
    v_group, v_owner, 'Will the invariant hold?', 'The test says so.',
    now() + interval '1 hour', now() + interval '2 hours', now() + interval '3 hours'
  );
  select id into v_yes from public.market_sides where market_id = v_market and ordinal = 0;
  select id into v_no from public.market_sides where market_id = v_market and ordinal = 1;

  perform public.place_stake(v_market, v_yes, v_owner, 100);
  perform public.place_stake(v_market, v_no, v_member, 300);

  if exists (
    select 1 from public.market_pools_sealed
    where market_id = v_market and (pool is not null or stake_count is not null or revealed)
  ) then
    raise exception 'sealed side data leaked';
  end if;
  if exists (
    select 1 from public.market_totals
    where market_id = v_market
      and (total_pool is not null or participants <> 2 or revealed)
  ) then
    raise exception 'sealed total data leaked or participant count is wrong';
  end if;

  v_failed := false;
  begin
    perform public.resolve_market(v_market, v_owner, v_yes);
  exception when invalid_parameter_value then
    v_failed := true;
  end;
  if not v_failed then raise exception 'market resolved before close'; end if;

  update public.markets
  set reveal_at = now() - interval '3 hours',
      close_at = now() - interval '2 hours',
      resolve_at = now() + interval '1 hour'
  where id = v_market;

  v_failed := false;
  begin
    perform public.resolve_market(v_market, v_owner, v_yes);
  exception when invalid_parameter_value then
    v_failed := true;
  end;
  if not v_failed then raise exception 'market resolved before resolve_at'; end if;

  update public.markets set resolve_at = now() - interval '1 hour' where id = v_market;
  if public.resolve_market(v_market, v_owner, v_yes) <> 'resolved' then
    raise exception 'market did not resolve';
  end if;
  if public.points_balance(v_group, v_owner) <> 1300
    or public.points_balance(v_group, v_member) <> 700 then
    raise exception 'parimutuel payout is incorrect';
  end if;

  v_market := public.open_market(
    v_group, v_owner, 'Will an empty winning side void?', 'Yes.',
    now() + interval '1 hour', now() + interval '2 hours', now() + interval '3 hours'
  );
  select id into v_yes from public.market_sides where market_id = v_market and ordinal = 0;
  select id into v_no from public.market_sides where market_id = v_market and ordinal = 1;
  perform public.place_stake(v_market, v_yes, v_owner, 100);
  update public.markets
  set reveal_at = now() - interval '3 hours',
      close_at = now() - interval '2 hours',
      resolve_at = now() - interval '1 hour'
  where id = v_market;
  if public.resolve_market(v_market, v_owner, v_no) <> 'empty_side' then
    raise exception 'empty winning side did not void';
  end if;
  if public.points_balance(v_group, v_owner) <> 1300 then
    raise exception 'void did not refund the stake';
  end if;

  raise notice 'private beta invariant tests passed';
end $$;

rollback;
