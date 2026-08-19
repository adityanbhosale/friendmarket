-- Merge the inactive duplicate Yash membership into the original UUID while
-- retaining the duplicate UUID as a session/recovery alias. The original owns
-- the group and stake history; the duplicate owns only a second allocation.

begin;

create table public.member_uuid_aliases (
  group_id uuid not null references public.groups(id) on delete cascade,
  alias_user_id uuid not null references public.users(id) on delete cascade,
  canonical_user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_id, alias_user_id),
  foreign key (group_id, canonical_user_id)
    references public.group_members(group_id, user_id) on delete cascade,
  check (alias_user_id <> canonical_user_id)
);

do $$
declare
  v_group constant uuid := 'c07d8c17-7961-41c5-b294-8c6163399ed7';
  v_canonical constant uuid := '3e79c5b9-12ac-497a-83be-84ab7d4c01f5';
  v_duplicate constant uuid := '5e59e9cf-5d24-456a-ad02-6e37b6eee4c0';
  v_count integer;
begin
  if not exists (
    select 1 from public.group_members gm
    join public.users u on u.id = gm.user_id
    where gm.group_id = v_group and gm.user_id = v_canonical
      and lower(btrim(u.name)) = 'yash'
  ) or not exists (
    select 1 from public.group_members gm
    join public.users u on u.id = gm.user_id
    where gm.group_id = v_group and gm.user_id = v_duplicate
      and lower(btrim(u.name)) = 'yash'
  ) then
    raise exception 'expected Yash memberships are not present; refusing merge';
  end if;

  if exists (select 1 from public.groups where created_by = v_duplicate)
    or exists (
      select 1 from public.markets
      where proposer_id = v_duplicate
        or adjudicator_id = v_duplicate
        or resolved_by = v_duplicate
    )
    or exists (select 1 from public.stakes where user_id = v_duplicate)
    or exists (select 1 from public.market_participants where user_id = v_duplicate)
    or exists (select 1 from public.imessage_conversations where created_by = v_duplicate)
    or exists (select 1 from public.imessage_identities where user_id = v_duplicate)
  then
    raise exception 'duplicate Yash UUID acquired activity; refusing automatic merge';
  end if;

  select count(*) into v_count
  from public.points_ledger
  where group_id = v_group and user_id = v_duplicate
    and reason = 'allocation' and delta = 1000
    and market_id is null and stake_id is null;
  if v_count <> 1 or exists (
    select 1 from public.points_ledger
    where group_id = v_group and user_id = v_duplicate
      and not (
        reason = 'allocation' and delta = 1000
        and market_id is null and stake_id is null
      )
  ) then
    raise exception 'duplicate Yash ledger changed; refusing automatic merge';
  end if;

  -- Neither membership currently has a phone attached. Refuse to discard one
  -- if that changes before this migration reaches the database.
  if exists (
    select 1 from public.group_members
    where group_id = v_group and user_id = v_duplicate
      and phone_attached_at is not null
  ) then
    raise exception 'duplicate Yash attached a phone; refusing automatic merge';
  end if;

  delete from public.points_ledger
  where group_id = v_group and user_id = v_duplicate;
  delete from public.group_members
  where group_id = v_group and user_id = v_duplicate;
  insert into public.member_uuid_aliases (
    group_id, alias_user_id, canonical_user_id
  ) values (v_group, v_duplicate, v_canonical);
end $$;

alter table public.member_uuid_aliases enable row level security;
revoke all on public.member_uuid_aliases from public, anon, authenticated;
grant select, insert, update, delete on public.member_uuid_aliases to service_role;

commit;
