-- Let a registered member pair by direct-message command before adding Sidebar
-- to the native group. The first explicit command in that group consumes this
-- short-lived intent and creates the existing deterministic transport binding.

begin;

create table if not exists public.imessage_pending_links (
  sender_hash text primary key check (sender_hash ~ '^[0-9a-f]{64}$'),
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  foreign key (group_id, user_id)
    references public.group_members(group_id, user_id) on delete cascade,
  check (expires_at > created_at)
);
create index if not exists imessage_pending_links_expiry_idx
  on public.imessage_pending_links (expires_at);

alter table public.imessage_pending_links enable row level security;

create or replace function public.stage_imessage_web_link(
  p_sender_hash text,
  p_group_link_id text,
  p_phone_hash text,
  p_expires_at timestamptz
)
returns jsonb
language plpgsql
as $$
declare
  v_group public.groups%rowtype;
  v_user_id uuid;
begin
  if p_sender_hash !~ '^[0-9a-f]{64}$'
    or p_phone_hash !~ '^[0-9a-f]{64}$'
    or p_group_link_id !~ '^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$'
    or p_expires_at <= now() then
    raise exception 'invalid iMessage onboarding request' using errcode = '22023';
  end if;

  select * into v_group
  from public.groups
  where link_id = p_group_link_id;
  if not found then
    raise exception 'no Sidebar group uses that code' using errcode = '22023';
  end if;

  select user_id into v_user_id
  from public.group_members
  where group_id = v_group.id and phone_hash = p_phone_hash;
  if not found then
    raise exception 'this iMessage number does not match a registered member of that Sidebar group'
      using errcode = '42501';
  end if;

  insert into public.imessage_pending_links (
    sender_hash, group_id, user_id, expires_at
  ) values (
    p_sender_hash, v_group.id, v_user_id, p_expires_at
  )
  on conflict (sender_hash) do update
    set group_id = excluded.group_id,
        user_id = excluded.user_id,
        expires_at = excluded.expires_at,
        created_at = now();

  return jsonb_build_object(
    'group_id', v_group.id,
    'user_id', v_user_id,
    'group_name', v_group.name
  );
end;
$$;

create or replace function public.claim_imessage_web_link(
  p_sender_hash text,
  p_conversation_hash text
)
returns jsonb
language plpgsql
as $$
declare
  v_pending public.imessage_pending_links%rowtype;
  v_existing_group uuid;
  v_existing_user uuid;
begin
  if p_sender_hash !~ '^[0-9a-f]{64}$'
    or p_conversation_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid iMessage identity' using errcode = '22023';
  end if;

  delete from public.imessage_pending_links where expires_at <= now();
  select * into v_pending
  from public.imessage_pending_links
  where sender_hash = p_sender_hash and expires_at > now()
  for update;
  if not found then return null; end if;

  insert into public.imessage_conversations (
    conversation_hash, group_id, created_by
  ) values (
    p_conversation_hash, v_pending.group_id, v_pending.user_id
  ) on conflict (conversation_hash) do nothing;

  select group_id into v_existing_group
  from public.imessage_conversations
  where conversation_hash = p_conversation_hash;
  if v_existing_group is distinct from v_pending.group_id then
    raise exception 'this iMessage group is already connected to another Sidebar group'
      using errcode = '23505';
  end if;

  insert into public.imessage_identities (
    conversation_hash, sender_hash, user_id
  ) values (
    p_conversation_hash, p_sender_hash, v_pending.user_id
  ) on conflict do nothing;

  select user_id into v_existing_user
  from public.imessage_identities
  where conversation_hash = p_conversation_hash and sender_hash = p_sender_hash;
  if v_existing_user is distinct from v_pending.user_id then
    raise exception 'this iMessage sender is already connected to another member'
      using errcode = '23505';
  end if;
  if not exists (
    select 1 from public.imessage_identities
    where conversation_hash = p_conversation_hash and user_id = v_pending.user_id
  ) then
    raise exception 'this Sidebar member is already connected through another iMessage identity'
      using errcode = '23505';
  end if;

  delete from public.imessage_pending_links where sender_hash = p_sender_hash;
  return jsonb_build_object(
    'group_id', v_pending.group_id,
    'user_id', v_pending.user_id
  );
end;
$$;

revoke all on public.imessage_pending_links from public, anon, authenticated;
revoke all on function public.stage_imessage_web_link(text, text, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.claim_imessage_web_link(text, text)
  from public, anon, authenticated;

grant select, insert, update, delete on public.imessage_pending_links to service_role;
grant execute on function public.stage_imessage_web_link(text, text, text, timestamptz)
  to service_role;
grant execute on function public.claim_imessage_web_link(text, text)
  to service_role;

commit;
