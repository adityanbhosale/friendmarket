-- Optional iMessage transport bindings and short-lived browser setup tokens.
-- Run after 007. Sidebar groups remain valid without any row in these tables.

begin;

create table if not exists public.imessage_conversations (
  conversation_hash text primary key check (conversation_hash ~ '^[0-9a-f]{64}$'),
  group_id uuid not null references public.groups(id) on delete cascade,
  created_by uuid not null references public.users(id),
  created_at timestamptz not null default now()
);
create index if not exists imessage_conversations_group_idx
  on public.imessage_conversations (group_id);

create table if not exists public.imessage_identities (
  conversation_hash text not null references public.imessage_conversations(conversation_hash) on delete cascade,
  sender_hash text not null check (sender_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (conversation_hash, sender_hash),
  unique (conversation_hash, user_id)
);

create table if not exists public.imessage_setup_tokens (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  conversation_hash text not null check (conversation_hash ~ '^[0-9a-f]{64}$'),
  sender_hash text not null check (sender_hash ~ '^[0-9a-f]{64}$'),
  group_id uuid references public.groups(id) on delete cascade,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);
create index if not exists imessage_setup_tokens_expiry_idx
  on public.imessage_setup_tokens (expires_at)
  where consumed_at is null;

alter table public.imessage_conversations enable row level security;
alter table public.imessage_identities enable row level security;
alter table public.imessage_setup_tokens enable row level security;

create or replace function public.consume_imessage_setup(
  p_token_hash text,
  p_group_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
as $$
declare
  v_setup public.imessage_setup_tokens%rowtype;
  v_existing_group uuid;
  v_existing_user uuid;
begin
  select * into v_setup
  from public.imessage_setup_tokens
  where token_hash = p_token_hash
  for update;

  if not found or v_setup.consumed_at is not null or v_setup.expires_at <= now() then
    raise exception 'that iMessage setup link is invalid or expired' using errcode = '22023';
  end if;
  if v_setup.group_id is not null and v_setup.group_id is distinct from p_group_id then
    raise exception 'that iMessage setup link belongs to another Sidebar group' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = p_user_id
  ) then
    raise exception 'not a member of this group' using errcode = '42501';
  end if;

  insert into public.imessage_conversations (conversation_hash, group_id, created_by)
  values (v_setup.conversation_hash, p_group_id, p_user_id)
  on conflict (conversation_hash) do nothing;

  select group_id into v_existing_group
  from public.imessage_conversations
  where conversation_hash = v_setup.conversation_hash;
  if v_existing_group is distinct from p_group_id then
    raise exception 'this iMessage conversation is already linked to another Sidebar group'
      using errcode = '23505';
  end if;

  insert into public.imessage_identities (conversation_hash, sender_hash, user_id)
  values (v_setup.conversation_hash, v_setup.sender_hash, p_user_id)
  on conflict (conversation_hash, sender_hash) do nothing;

  select user_id into v_existing_user
  from public.imessage_identities
  where conversation_hash = v_setup.conversation_hash
    and sender_hash = v_setup.sender_hash;
  if v_existing_user is distinct from p_user_id then
    raise exception 'this iMessage sender is already linked to another member'
      using errcode = '23505';
  end if;

  update public.imessage_setup_tokens
  set consumed_at = now()
  where token_hash = p_token_hash;
end;
$$;

create or replace function public.create_group_with_owner_imessage(
  p_token_hash text,
  p_group_name text,
  p_link_id text,
  p_password_hash text,
  p_user_name text,
  p_recovery_code_hash text,
  p_starting_points integer default 1000
)
returns jsonb
language plpgsql
as $$
declare
  v_setup_group uuid;
  v_created jsonb;
begin
  select group_id into v_setup_group
  from public.imessage_setup_tokens
  where token_hash = p_token_hash
    and consumed_at is null
    and expires_at > now()
  for update;
  if not found then
    raise exception 'that iMessage setup link is invalid or expired' using errcode = '22023';
  end if;
  if v_setup_group is not null then
    raise exception 'this iMessage conversation is already linked to a Sidebar group'
      using errcode = '23505';
  end if;

  v_created := public.create_group_with_owner(
    p_group_name, p_link_id, p_password_hash, p_user_name,
    p_recovery_code_hash, p_starting_points
  );
  perform public.consume_imessage_setup(
    p_token_hash,
    (v_created->>'group_id')::uuid,
    (v_created->>'user_id')::uuid
  );
  return v_created;
end;
$$;

create or replace function public.join_group_member_imessage(
  p_token_hash text,
  p_group_id uuid,
  p_user_name text,
  p_recovery_code_hash text,
  p_starting_points integer default 1000
)
returns uuid
language plpgsql
as $$
declare
  v_setup_group uuid;
  v_user_id uuid;
begin
  select group_id into v_setup_group
  from public.imessage_setup_tokens
  where token_hash = p_token_hash
    and consumed_at is null
    and expires_at > now()
  for update;
  if not found then
    raise exception 'that iMessage setup link is invalid or expired' using errcode = '22023';
  end if;
  if v_setup_group is distinct from p_group_id then
    raise exception 'that iMessage setup link belongs to another Sidebar group'
      using errcode = '42501';
  end if;

  v_user_id := public.join_group_member(
    p_group_id, p_user_name, p_recovery_code_hash, p_starting_points
  );
  perform public.consume_imessage_setup(p_token_hash, p_group_id, v_user_id);
  return v_user_id;
end;
$$;

revoke all on public.imessage_conversations from public, anon, authenticated;
revoke all on public.imessage_identities from public, anon, authenticated;
revoke all on public.imessage_setup_tokens from public, anon, authenticated;
revoke all on function public.consume_imessage_setup(text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.create_group_with_owner_imessage(text, text, text, text, text, text, integer) from public, anon, authenticated;
revoke all on function public.join_group_member_imessage(text, uuid, text, text, integer) from public, anon, authenticated;

grant select, insert, update, delete on public.imessage_conversations to service_role;
grant select, insert, update, delete on public.imessage_identities to service_role;
grant select, insert, update, delete on public.imessage_setup_tokens to service_role;
grant execute on function public.consume_imessage_setup(text, uuid, uuid) to service_role;
grant execute on function public.create_group_with_owner_imessage(text, text, text, text, text, text, integer) to service_role;
grant execute on function public.join_group_member_imessage(text, uuid, text, text, integer) to service_role;

commit;
