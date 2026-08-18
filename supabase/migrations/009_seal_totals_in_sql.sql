-- The seal was only half real.
--
-- market_pools_sealed does it properly: a CASE on reveal_at, so the pool is
-- literally not a number in the result set until the market reveals. But
-- market_totals summed every stake unconditionally and merely published a
-- `revealed` boolean alongside, and market_pools exposed per-side pools and
-- implied probability with no guard at all.
--
-- Nothing leaked, because all three call sites happened to check `revealed`
-- before rendering. That is the problem: the guarantee was being enforced by
-- three separate pieces of application code remembering to ask, and the
-- seeding phase is the one mechanic the venue actually sells. One render that
-- forgets — a new page, a debug dump, a JSON endpoint, an admin view — and
-- every sealed pool is on screen. A rule this load-bearing belongs in the
-- schema, where forgetting is not possible.
--
-- After this migration the number does not exist to be leaked. Participant
-- count stays visible throughout: market_pools_sealed has always published
-- stake_count pre-reveal, "9 bettors" is what makes an empty board look alive,
-- and a count of people tells you nothing about the size of anyone's position.
--
-- Run after 008 in the Supabase SQL editor.

begin;

-- ---------------------------------------------------------------------------
-- 1. market_totals
-- ---------------------------------------------------------------------------
-- Supersedes the definition in 002. drop-then-create rather than CREATE OR
-- REPLACE: replace can only append columns, and total_pool is changing from
-- always-present to null-until-reveal.
drop view if exists public.market_totals;

create view public.market_totals with (security_invoker = true) as
select
  m.id as market_id,
  case when now() >= m.reveal_at
       then coalesce(sum(s.amount), 0)::integer
  end                                        as total_pool,
  count(distinct s.user_id)::integer         as participants,
  now() >= m.reveal_at                       as revealed
from public.markets m
left join public.stakes s on s.market_id = m.id
group by m.id, m.reveal_at;

comment on view public.market_totals is
  'Per-market totals. total_pool is NULL until reveal_at; participants is always visible.';

-- ---------------------------------------------------------------------------
-- 2. market_pools
-- ---------------------------------------------------------------------------
-- This view predates the migration series. No application code reads it —
-- everything goes through market_pools_sealed — but it published per-side
-- pools AND the implied probability derived from them, which is the sealed
-- number twice over.
--
-- Plain `drop view`, not CASCADE: if something does depend on this, the
-- migration should fail loudly rather than quietly delete the dependent.
-- market_pools_sealed reads from stakes directly since 002, so it is not one.
drop view if exists public.market_pools;

create view public.market_pools with (security_invoker = true) as
select
  s.market_id,
  s.side_id,
  case when now() >= m.reveal_at
       then sum(s.amount)::integer
  end as pool,
  case when now() >= m.reveal_at
       then round(
              sum(s.amount)::numeric
                / nullif(sum(sum(s.amount)) over (partition by s.market_id), 0),
              4)
  end as implied_prob
from public.stakes s
join public.markets m on m.id = s.market_id
group by s.market_id, s.side_id, m.reveal_at;

comment on view public.market_pools is
  'Per-side pools. pool and implied_prob are NULL until reveal_at. Prefer market_pools_sealed.';

-- ---------------------------------------------------------------------------
-- 3. Privileges
-- ---------------------------------------------------------------------------
-- A dropped view takes its grants with it, so these have to be re-stated or
-- the recreated views would fall back to whatever the defaults allow.
revoke all on public.market_totals from public, anon, authenticated;
revoke all on public.market_pools  from public, anon, authenticated;
grant select on public.market_totals, public.market_pools to service_role;

commit;
