// Read side for markets. Everything here goes through the sealed views, so a
// pool cannot be read before its reveal_at even by mistake.

import { select, selectOne } from "./db";

export type Market = {
  id: string;
  group_id: string;
  display_num: number;
  kind: string;
  question: string;
  criteria: string;
  proposer_id: string;
  reveal_at: string;
  close_at: string;
  resolve_at: string;
  created_at: string;
  outcome_side: string | null;
  void_reason: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
};

export type Side = {
  id: string;
  market_id: string;
  label: string;
  ordinal: number;
};

export type SealedPool = {
  market_id: string;
  side_id: string;
  /** Null while the market is sealed. */
  pool: number | null;
  stake_count: number;
  revealed: boolean;
};

export type Totals = {
  market_id: string;
  /** Null until reveal_at. The view withholds it; see migration 007. */
  total_pool: number | null;
  participants: number;
  revealed: boolean;
};

export type Stake = {
  id: string;
  market_id: string;
  side_id: string;
  user_id: string;
  amount: number;
  created_at: string;
};

/**
 * Lifecycle, derived from timestamps rather than stored. A stored state would
 * need a scheduler to advance it and would be wrong between ticks.
 */
export type MarketState = "seeding" | "open" | "closed" | "resolved" | "void";

export function marketState(m: Market, now = Date.now()): MarketState {
  if (m.resolved_at) return m.void_reason ? "void" : "resolved";
  if (now < Date.parse(m.reveal_at)) return "seeding";
  if (now < Date.parse(m.close_at)) return "open";
  return "closed";
}

export const STATE_LABEL: Record<MarketState, string> = {
  seeding: "Seeding (sealed)",
  open: "Open",
  closed: "Closed",
  resolved: "Resolved",
  void: "Void",
};

export async function listMarkets(groupId: string): Promise<
  Array<{ market: Market; totals: Totals | null }>
> {
  const markets = await select<Market>("markets", {
    group_id: `eq.${groupId}`,
    order: "display_num.desc",
  });
  if (markets.length === 0) return [];

  const ids = markets.map((m) => m.id).join(",");
  const totals = await select<Totals>("market_totals", {
    market_id: `in.(${ids})`,
  });
  const byId = new Map(totals.map((t) => [t.market_id, t]));

  return markets.map((market) => ({
    market,
    totals: byId.get(market.id) ?? null,
  }));
}

export async function getMarket(
  marketId: string,
  groupId: string,
  userId: string,
) {
  // Scoped by group_id as well as id: a market id from another group must not
  // resolve just because the caller happens to know it.
  const market = await selectOne<Market>("markets", {
    id: `eq.${marketId}`,
    group_id: `eq.${groupId}`,
  });
  if (!market) return null;

  const [sides, pools, totals, myStakes] = await Promise.all([
    select<Side>("market_sides", {
      market_id: `eq.${marketId}`,
      order: "ordinal.asc",
    }),
    select<SealedPool>("market_pools_sealed", { market_id: `eq.${marketId}` }),
    selectOne<Totals>("market_totals", { market_id: `eq.${marketId}` }),
    select<Stake>("stakes", {
      market_id: `eq.${marketId}`,
      user_id: `eq.${userId}`,
    }),
  ]);

  return { market, sides, pools, totals, myStakes };
}

/**
 * Implied probability from the pool ratio. Null while sealed — the whole point
 * of seeding is that there is no price to anchor to yet.
 */
export function impliedProbability(
  pools: SealedPool[],
  sideId: string,
): number | null {
  if (pools.some((p) => !p.revealed)) return null;

  const total = pools.reduce((sum, p) => sum + (p.pool ?? 0), 0);
  if (total === 0) return null;

  const side = pools.find((p) => p.side_id === sideId);
  return ((side?.pool ?? 0) / total) * 100;
}

/**
 * How a pool is written wherever one appears.
 *
 * Since 007 the database withholds the number until reveal, so this is no
 * longer the thing keeping the seal — it decides what to show in the absence,
 * which is still a UI question. Reading the value rather than the `revealed`
 * flag means the two can never disagree on screen.
 */
export function poolLabel(
  totals: Totals | null | undefined,
  sealedText = "pool sealed",
): string {
  // Both conditions on purpose. `total_pool === null` is the post-007 schema
  // withholding the number; `!revealed` still catches the pre-007 view, which
  // always returned one. Checking both means this renders correctly whichever
  // view it is talking to, so shipping the code and running the migration do
  // not have to be the same instant.
  if (!totals || !totals.revealed || totals.total_pool === null) {
    return sealedText;
  }
  return `${totals.total_pool.toLocaleString("en-US")} pts`;
}
