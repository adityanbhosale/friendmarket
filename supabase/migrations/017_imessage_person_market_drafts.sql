-- Short-lived, deterministic two-turn creation for person markets. Raw phone
-- numbers are hashed by the agent before the completion RPC and never stored.

begin;

create table if not exists public.imessage_market_drafts (
  user_id uuid primary key references public.users(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  question text not null check (length(btrim(question)) between 1 and 200),
  criteria text not null check (length(btrim(criteria)) between 1 and 500),
  reveal_at timestamptz not null,
  close_at timestamptz not null,
  resolve_at timestamptz not null,
  subject_name text not null check (length(btrim(subject_name)) between 1 and 40),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  foreign key (group_id, user_id)
    references public.group_members(group_id, user_id) on delete cascade,
  check (reveal_at < close_at and close_at < resolve_at),
  check (expires_at > created_at)
);
create index if not exists imessage_market_drafts_expiry_idx
  on public.imessage_market_drafts (expires_at);

alter table public.imessage_market_drafts enable row level security;

create or replace function public.stage_imessage_market_draft(
  p_group_id uuid,
  p_user_id uuid,
  p_question text,
  p_criteria text,
  p_reveal_at timestamptz,
  p_close_at timestamptz,
  p_resolve_at timestamptz,
  p_subject_name text,
  p_expires_at timestamptz
)
returns void
language plpgsql
as $$
begin
  if not exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = p_user_id
      and phone_attached_at is not null
  ) then
    raise exception 'not a phone-verified member of this Sidebar group'
      using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_question, ''))) not between 1 and 200
    or length(btrim(coalesce(p_criteria, ''))) not between 1 and 500
    or length(btrim(coalesce(p_subject_name, ''))) not between 1 and 40
    or not (p_reveal_at < p_close_at and p_close_at < p_resolve_at)
    or p_close_at <= now()
    or p_expires_at <= now() then
    raise exception 'invalid pending market' using errcode = '22023';
  end if;

  insert into public.imessage_market_drafts (
    user_id, group_id, question, criteria, reveal_at, close_at, resolve_at,
    subject_name, expires_at
  ) values (
    p_user_id, p_group_id, btrim(p_question), btrim(p_criteria), p_reveal_at,
    p_close_at, p_resolve_at, btrim(p_subject_name), p_expires_at
  )
  on conflict (user_id) do update set
    group_id = excluded.group_id,
    question = excluded.question,
    criteria = excluded.criteria,
    reveal_at = excluded.reveal_at,
    close_at = excluded.close_at,
    resolve_at = excluded.resolve_at,
    subject_name = excluded.subject_name,
    expires_at = excluded.expires_at,
    created_at = now();
end;
$$;

create or replace function public.complete_imessage_market_draft(
  p_group_id uuid,
  p_user_id uuid,
  p_subject_name text default null,
  p_subject_phone_hash text default null
)
returns uuid
language plpgsql
as $$
declare
  v_draft public.imessage_market_drafts%rowtype;
  v_market_id uuid;
begin
  delete from public.imessage_market_drafts where expires_at <= now();
  select * into v_draft
  from public.imessage_market_drafts
  where user_id = p_user_id and group_id = p_group_id
  for update;
  if not found then
    raise exception 'there is no pending market for you in this Sidebar group'
      using errcode = '22023';
  end if;
  if v_draft.close_at <= now() then
    raise exception 'that pending market''s betting close time has passed'
      using errcode = '22023';
  end if;
  if (p_subject_name is null) <> (p_subject_phone_hash is null) then
    raise exception 'subject name and phone are both required' using errcode = '22023';
  end if;

  v_market_id := public.open_market_with_subject(
    v_draft.group_id,
    v_draft.user_id,
    v_draft.question,
    v_draft.criteria,
    v_draft.reveal_at,
    v_draft.close_at,
    v_draft.resolve_at,
    p_subject_name,
    p_subject_phone_hash
  );
  delete from public.imessage_market_drafts where user_id = p_user_id;
  return v_market_id;
end;
$$;

revoke all on public.imessage_market_drafts from public, anon, authenticated;
revoke all on function public.stage_imessage_market_draft(
  uuid, uuid, text, text, timestamptz, timestamptz, timestamptz, text, timestamptz
) from public, anon, authenticated;
revoke all on function public.complete_imessage_market_draft(uuid, uuid, text, text)
  from public, anon, authenticated;

grant select, insert, update, delete on public.imessage_market_drafts to service_role;
grant execute on function public.stage_imessage_market_draft(
  uuid, uuid, text, text, timestamptz, timestamptz, timestamptz, text, timestamptz
) to service_role;
grant execute on function public.complete_imessage_market_draft(uuid, uuid, text, text)
  to service_role;

commit;
