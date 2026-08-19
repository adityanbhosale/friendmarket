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
  v_adjudicator uuid;
  v_yes uuid;
  v_no uuid;
  v_before integer;
  v_after integer;
  v_entry jsonb;
  v_failed boolean := false;
begin
  v_created := public.create_group_with_owner_phone(
    'Invariant test', 'TEST-BETA', 'test-password-hash', 'Owner',
    'owner@example.com', repeat('a', 64), repeat('4', 64),
    'SB-AAAA-BBBB-CCCC', 1000
  );
  v_group := (v_created->>'group_id')::uuid;
  v_owner := (v_created->>'user_id')::uuid;
  v_member := public.join_group_member_phone(
    v_group, 'Member', repeat('b', 64), repeat('5', 64),
    'SB-DDDD-EEEE-FFFF', 1000
  );

  select count(*) into v_before
  from public.group_members where group_id = v_group;
  v_entry := public.enter_group_member_phone(
    v_group, '  member  ', repeat('9', 64), repeat('5', 64),
    'SB-DDDD-EEEE-FFFF', 1000
  );
  select count(*) into v_after
  from public.group_members where group_id = v_group;
  if (v_entry->>'user_id')::uuid <> v_member
    or (v_entry->>'created')::boolean
    or v_after <> v_before
  then
    raise exception 'phone login did not reuse the registered member UUID';
  end if;

  v_failed := false;
  begin
    perform public.enter_group_member_phone(
      v_group, 'Member', repeat('8', 64), repeat('8', 64),
      'SB-PPPP-QQQQ-RRRR', 1000
    );
  exception when unique_violation then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'a duplicate normalized member name created another UUID';
  end if;

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
  v_imessage_member := public.join_group_member_phone_imessage(
    repeat('f', 64), v_group, 'iMessage member', repeat('3', 64),
    repeat('6', 64), 'SB-GGGG-HHHH-JJJJ', 1000
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
    perform public.join_group_member_phone(
      v_group, 'Collision', repeat('a', 64), repeat('7', 64),
      'SB-KKKK-MMMM-NNNN', 1000
    );
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
  select adjudicator_id into v_adjudicator from public.markets where id = v_market;
  if v_adjudicator is null or v_adjudicator = v_owner then
    raise exception 'market did not select another eligible member as adjudicator';
  end if;
  select id into v_yes from public.market_sides where market_id = v_market and ordinal = 0;
  select id into v_no from public.market_sides where market_id = v_market and ordinal = 1;

  perform public.join_market(v_market, v_owner);
  perform public.join_market(v_market, v_member);
  perform public.place_stake_joined(v_market, v_yes, v_owner, 100);
  perform public.place_stake_joined(v_market, v_no, v_member, 300);

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
    perform public.resolve_market(v_market, v_adjudicator, v_yes);
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
    perform public.resolve_market(v_market, v_adjudicator, v_yes);
  exception when invalid_parameter_value then
    v_failed := true;
  end;
  if not v_failed then raise exception 'market resolved before resolve_at'; end if;

  update public.markets set resolve_at = now() - interval '1 hour' where id = v_market;

  v_failed := false;
  begin
    perform public.resolve_market(v_market, v_owner, v_yes);
  exception when insufficient_privilege then
    v_failed := true;
  end;
  if not v_failed then raise exception 'non-adjudicator resolved a market'; end if;

  if public.resolve_market(v_market, v_adjudicator, v_yes) <> 'resolved' then
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
  select adjudicator_id into v_adjudicator from public.markets where id = v_market;
  select id into v_yes from public.market_sides where market_id = v_market and ordinal = 0;
  select id into v_no from public.market_sides where market_id = v_market and ordinal = 1;
  perform public.join_market(v_market, v_owner);
  perform public.place_stake_joined(v_market, v_yes, v_owner, 100);
  update public.markets
  set reveal_at = now() - interval '3 hours',
      close_at = now() - interval '2 hours',
      resolve_at = now() - interval '1 hour'
  where id = v_market;
  if public.resolve_market(v_market, v_adjudicator, v_no) <> 'empty_side' then
    raise exception 'empty winning side did not void';
  end if;
  if public.points_balance(v_group, v_owner) <> 1300 then
    raise exception 'void did not refund the stake';
  end if;

  v_market := public.open_market_with_subject(
    v_group, v_owner, 'Will Member be late?', 'The clock decides.',
    now() + interval '1 hour', now() + interval '2 hours', now() + interval '3 hours',
    'Member', repeat('5', 64)
  );
  v_failed := false;
  begin
    perform public.join_market(v_market, v_member);
  exception when insufficient_privilege then
    v_failed := true;
  end;
  if not v_failed then raise exception 'market subject joined their own market'; end if;
  perform public.join_market(v_market, v_owner);

  raise notice 'private beta invariant tests passed';
end $$;

rollback;
