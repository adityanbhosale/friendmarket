// Read side for markets. Everything here goes through the sealed views, so a
// pool cannot be read before its reveal_at even by mistake.

import { select, selectOne } from "./db";
import type { MarketState } from "./market-rules";
export {
  canResolveAt,
  impliedProbability,
  marketState,
  type MarketState,
} from "./market-rules";

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
  stake_count: number | null;
  revealed: boolean;
};

export type Totals = {
  market_id: string;
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
