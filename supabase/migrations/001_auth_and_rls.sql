-- Sidebar — lock down the API surface, add group passwords, add the waitlist.
-- Run this in the Supabase SQL editor. Safe to run more than once.
--
-- Context: this project has no Supabase Auth. `users.id` is a plain
-- gen_random_uuid() with no link to auth.users, so there is no auth.uid() for a
-- policy to key on. A browser holding the publishable key is anonymous by
-- construction and no policy can tell a member from a stranger. The only
-- workable posture is therefore: anon gets nothing, and every read and write
-- goes through the Next.js server under the secret key, which carries a
-- BYPASSRLS role and is unaffected by everything below.

begin;

-- ---------------------------------------------------------------------------
-- 1. Revoke the blanket grants that made every table world-readable.
-- ---------------------------------------------------------------------------
-- Supabase grants anon/authenticated broad privileges on public by default.
-- RLS alone would deny reads, but revoking is the stronger statement: PostgREST
-- stops advertising these relations at all.

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;

-- Anything created later inherits the same posture.
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;

-- This was reachable over the API. It should never have been.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke all on function public.rls_auto_enable() from anon, authenticated, public;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Enable RLS on every base table, with zero policies = deny all.
-- ---------------------------------------------------------------------------
-- Written as a loop over relkind='r' so it skips views (market_pools may be
-- one; ALTER TABLE ... ENABLE ROW LEVEL SECURITY errors on a view). A view has
-- no RLS of its own — it is governed by its base tables, which are covered here.

do $$
declare
  rel record;
begin
  for rel in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
  loop
    execute format('alter table public.%I enable row level security', rel.relname);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Group passwords.
-- ---------------------------------------------------------------------------
-- password_hash holds a scrypt digest as `scrypt$N$r$p$<salt-b64>$<hash-b64>`.
-- Never a plaintext password, and never a bare unsalted hash.

alter table public.groups add column if not exists password_hash text;

-- The table is empty today, so this can be enforced properly rather than left
-- nullable "for now". A group with no password would be a group anyone can walk
-- into, which is the thing we are fixing.
do $$
begin
  if exists (select 1 from public.groups where password_hash is null) then
    raise exception 'groups rows exist without a password_hash; set one before enforcing NOT NULL';
  end if;
  alter table public.groups alter column password_hash set not null;
exception
  when others then
    raise notice 'skipped NOT NULL on groups.password_hash: %', sqlerrm;
end $$;

-- link_id is one half of the credential pair. Duplicates would make a join
-- ambiguous, which is a correctness bug before it is a security one.
create unique index if not exists groups_link_id_key on public.groups (link_id);

-- ---------------------------------------------------------------------------
-- 4. Waitlist for the landing-page form.
-- ---------------------------------------------------------------------------
-- Deliberately not `users`: someone leaving a name on a marketing page is not a
-- person who can hold stakes, and users.id is an FK target for stakes.user_id.
-- Conflating them would let a waitlist entry be staked against.

create table if not exists public.signups (
  id         bigint generated always as identity primary key,
  name       text        not null check (length(btrim(name)) between 1 and 40),
  -- Normalised form, generated so it can never drift from name. Exists so the
  -- API can look someone up with a plain equality filter; a case-insensitive
  -- LIKE would treat % and _ in a name as wildcards.
  name_key   text generated always as (lower(btrim(name))) stored,
  created_at timestamptz not null default now()
);

-- Case-insensitive dedupe, matching the behaviour the old KV route had.
create unique index if not exists signups_name_key_uniq on public.signups (name_key);

alter table public.signups enable row level security;

-- ---------------------------------------------------------------------------
-- 5. Throttling state for group joins.
-- ---------------------------------------------------------------------------
-- A shared group password is guessable by anyone holding the link, and the link
-- travels through group chats. Without a limiter the password is only as strong
-- as the attacker's patience.

create table if not exists public.join_attempts (
  id           bigint generated always as identity primary key,
  link_id      text        not null,
  client_hash  text        not null,   -- HMAC of client IP; never the raw address
  succeeded    boolean     not null default false,
  attempted_at timestamptz not null default now()
);

create index if not exists join_attempts_lookup_idx
  on public.join_attempts (link_id, client_hash, attempted_at desc);

alter table public.join_attempts enable row level security;

-- ---------------------------------------------------------------------------
-- 6. Seal the pools in the database, not just in the UI.
-- ---------------------------------------------------------------------------
-- Rulebook section 4: stakes during seeding are placed blind. If the server can
-- SELECT a pool before reveal_at, one careless query leaks the seal. This view
-- makes that structurally impossible — it returns NULL for a sealed market, so
-- application code reads it instead of market_pools directly.

create or replace view public.market_pools_sealed as
select
  p.market_id,
  p.side_id,
  case when now() >= m.reveal_at then p.pool         end as pool,
  case when now() >= m.reveal_at then p.implied_prob end as implied_prob,
  now() >= m.reveal_at                                   as revealed
from public.market_pools p
join public.markets m on m.id = p.market_id;

revoke all on public.market_pools_sealed from anon, authenticated;

commit;

-- ---------------------------------------------------------------------------
-- Verify: this should return zero rows. Any row is a table anon can still read.
-- ---------------------------------------------------------------------------
-- select table_name, privilege_type
-- from information_schema.role_table_grants
-- where grantee in ('anon','authenticated') and table_schema = 'public';
