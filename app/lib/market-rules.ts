export type MarketState = "seeding" | "open" | "closed" | "resolved" | "void";

type LifecycleMarket = {
  reveal_at: string;
  close_at: string;
  resolve_at: string;
  resolved_at: string | null;
  void_reason: string | null;
};

type Pool = {
  side_id: string;
  pool: number | null;
  revealed: boolean;
};

/** Lifecycle is derived so it cannot drift while waiting for a scheduler. */
export function marketState(market: LifecycleMarket, now = Date.now()): MarketState {
  if (market.resolved_at) return market.void_reason ? "void" : "resolved";
  if (now < Date.parse(market.reveal_at)) return "seeding";
  if (now < Date.parse(market.close_at)) return "open";
  return "closed";
}

export function canResolveAt(market: LifecycleMarket, now = Date.now()): boolean {
  return !market.resolved_at && now >= Date.parse(market.resolve_at);
}

export function impliedProbability(pools: Pool[], sideId: string): number | null {
  if (pools.some((pool) => !pool.revealed)) return null;

  const total = pools.reduce((sum, pool) => sum + (pool.pool ?? 0), 0);
  if (total === 0) return null;

  const side = pools.find((pool) => pool.side_id === sideId);
  return ((side?.pool ?? 0) / total) * 100;
}
