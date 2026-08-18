import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Masthead, Shell, SectionLabel } from "../../../shell";
import { requireMembership } from "../../../lib/auth";
import { getBalance } from "../../../lib/points";
import {
  getMarket,
  impliedProbability,
  marketState,
  poolLabel,
  STATE_LABEL,
  type MarketState,
} from "../../../lib/market-data";
import { StakeForm, ResolveForm } from "./market-forms";

export const metadata: Metadata = { title: "Market — Sidebar" };
export const dynamic = "force-dynamic";

const LIFECYCLE: MarketState[] = ["seeding", "open", "closed"];

function when(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function MarketPage({
  params,
}: PageProps<"/group/m/[id]">) {
  const { id } = await params;
  const { user, group } = await requireMembership();

  const data = await getMarket(id, group.id, user.id);
  if (!data) notFound();

  const { market, sides, pools, totals, myStakes } = data;
  const state = marketState(market);
  const balance = await getBalance(group.id, user.id);

  const isProposer = market.proposer_id === user.id;
  const canStake = state === "seeding" || state === "open";
  const canResolve = isProposer && state === "closed";
  const sealed = state === "seeding";

  const stakedOn = (sideId: string) =>
    myStakes
      .filter((s) => s.side_id === sideId)
      .reduce((sum, s) => sum + s.amount, 0);

  return (
    <main className="flex-1">
      <Masthead up="/group" />
      <Shell>
        <div className="grid gap-x-12 gap-y-12 py-16 sm:py-20 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <SectionLabel>Market</SectionLabel>
            <h1 className="type-head mt-3 text-balance">{market.question}</h1>

            <p className="measure mt-5 text-sm leading-relaxed text-muted">
              {market.criteria}
            </p>

            <dl className="mt-8 border-t border-rule text-sm">
              <Row label="Seeding ends" value={when(market.reveal_at)} />
              <Row label="Closes" value={when(market.close_at)} />
              <Row label="Resolved by" value={when(market.resolve_at)} last />
            </dl>
          </div>

          <div className="lg:col-span-7 lg:col-start-6">
            <div className="max-w-[560px]">
              <article className="border-t border-b border-foreground">
                <div className="flex items-baseline justify-between gap-4 border-b border-rule py-3 text-xs text-muted">
                  <span className="font-mono tabular-nums">
                    {String(market.display_num).padStart(4, "0")}
                  </span>
                  <span>{group.name}</span>
                </div>

                {/* Lifecycle. Current state carries weight, never colour. */}
                <div className="flex flex-wrap items-baseline gap-2 border-b border-rule py-3 text-xs">
                  {LIFECYCLE.map((s, i) => (
                    <span key={s} className="flex items-baseline gap-2">
                      {i > 0 && <span className="text-muted">→</span>}
                      <span
                        className={
                          s === state
                            ? "font-semibold underline decoration-1 underline-offset-4"
                            : "text-muted"
                        }
                        aria-current={s === state ? "true" : undefined}
                      >
                        {STATE_LABEL[s]}
                      </span>
                    </span>
                  ))}
                  {(state === "resolved" || state === "void") && (
                    <span className="flex items-baseline gap-2">
                      <span className="text-muted">→</span>
                      <span className="font-semibold underline decoration-1 underline-offset-4">
                        {STATE_LABEL[state]}
                      </span>
                    </span>
                  )}
                </div>

                {sides.map((side) => {
                  const pool = pools.find((p) => p.side_id === side.id);
                  const prob = impliedProbability(pools, side.id);
                  const mine = stakedOn(side.id);
                  const won = market.outcome_side === side.id;

                  return (
                    <div
                      key={side.id}
                      className="grid grid-cols-[1fr_6rem_4rem] items-baseline gap-x-4 border-b border-rule py-3"
                    >
                      <span
                        className={
                          won
                            ? "font-semibold underline decoration-1 underline-offset-4"
                            : "font-normal"
                        }
                      >
                        {side.label}
                        {mine > 0 && (
                          <span className="ml-2 text-xs text-muted">
                            you: {mine.toLocaleString("en-US")}
                          </span>
                        )}
                      </span>
                      <span className="text-right font-mono tabular-nums">
                        {/* Sealed markets have no pool to show, by design. */}
                        {sealed
                          ? "▮▮▮"
                          : (pool?.pool ?? 0).toLocaleString("en-US")}
                      </span>
                      <span className="text-right font-mono text-muted tabular-nums">
                        {prob === null ? "—" : `${prob.toFixed(0)}%`}
                      </span>
                    </div>
                  );
                })}

                <dl>
                  <Row
                    label="Pool"
                    value={poolLabel(totals, "sealed")}
                    mono
                  />
                  <Row
                    label="Bettors"
                    value={String(totals?.participants ?? 0)}
                    mono
                    last
                  />
                </dl>
              </article>

              {market.void_reason && (
                <p className="mt-4 text-sm text-muted">
                  Voided — every stake was refunded.{" "}
                  {/* The schema constrains void_reason to two labels, so the
                      no-stakes case is told apart by the pool being empty. */}
                  {market.void_reason === "ambiguous"
                    ? "No outcome was declared."
                    : (totals?.total_pool ?? 0) === 0
                      ? "Nobody staked."
                      : "Nobody backed the side that happened."}
                </p>
              )}

              <div className="mt-8">
                {canStake && (
                  <StakeForm
                    marketId={market.id}
                    sides={sides.map((s) => ({ id: s.id, label: s.label }))}
                    balance={balance}
                    sealed={sealed}
                  />
                )}

                {canResolve && (
                  <ResolveForm
                    marketId={market.id}
                    sides={sides.map((s) => ({ id: s.id, label: s.label }))}
                  />
                )}

                {state === "closed" && !isProposer && (
                  <p className="border-t border-foreground pt-6 text-sm text-muted">
                    Closed. Waiting on whoever opened it to settle.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </Shell>
    </main>
  );
}

function Row({
  label,
  value,
  mono = false,
  last = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  last?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-4 py-2.5 ${
        last ? "" : "border-b border-rule"
      }`}
    >
      <dt className="text-muted">{label}</dt>
      <dd className={mono ? "font-mono tabular-nums" : ""}>{value}</dd>
    </div>
  );
}
