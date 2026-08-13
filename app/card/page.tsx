import type { Metadata } from "next";
import Link from "next/link";
import { Nav, Shell } from "../shell";
import { getSlate, type SlateMarket } from "./markets";

export const metadata: Metadata = {
  title: "Trip card — friendmarket",
  description:
    "A curated slate of public prediction markets resolving inside one trip window, staked blind against each other.",
};

const CARD_NO = "001";
const PARTICIPANTS = 11;
const MASK = "▮▮▮";
const POOL_MASK = "▮▮▮▮▮";

export default async function CardPage() {
  const slate = await getSlate();

  return (
    <main className="flex-1">
      <div className="border-b border-rule">
        <Shell>
          <div className="flex items-baseline justify-between gap-6 py-5">
            <Link href="/" className="type-wordmark font-medium hover:text-muted">
              friendmarket
            </Link>
            <Nav current="card" />
          </div>
        </Shell>
      </div>

      <Shell>
        <div className="py-16 sm:py-20 lg:py-24">
          <h1 className="type-statement max-w-[18ch] text-balance">
            A card of real markets, staked blind.
          </h1>

          <div className="measure mt-8 space-y-4 leading-relaxed">
            <p>
              The group is not trading against the world. Polymarket&apos;s
              price is the consensus — the number to disagree with — and the
              real bet is against each other&apos;s read of it.
            </p>
            <p>
              Stakes stay sealed until the card locks at the start of the trip,
              so nobody is following anybody. Whoever reads their
              friends&apos; blind spots best takes the pool.
            </p>
          </div>

          <div className="mt-14 max-w-[820px]">
            <Slate slate={slate} />

            <p className="mt-6 text-sm text-muted">
              Optional side pot: one three-leg parlay per person, longest
              surviving odds takes it.
            </p>

            {slate.source === "sample" && (
              <p className="mt-2 text-sm text-muted">
                Sample slate shown — live Polymarket prices were unavailable.
              </p>
            )}
          </div>
        </div>
      </Shell>

      <footer className="border-t border-rule">
        <Shell>
          <div className="flex flex-wrap items-baseline justify-between gap-4 py-8">
            <Nav current="card" />
            <span className="text-sm text-muted">
              Points only. Settle your own Venmo beef.
            </span>
          </div>
        </Shell>
      </footer>
    </main>
  );
}

function Slate({ slate }: { slate: Awaited<ReturnType<typeof getSlate>> }) {
  const { markets, window } = slate;

  return (
    <section className="border-t border-b border-foreground">
      {/* Slate head */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-b border-rule py-3 text-xs">
        <span className="font-mono tabular-nums">TRIP CARD NO. {CARD_NO}</span>
        <span className="text-muted">
          {formatRange(window.start, window.end)}
        </span>
      </div>

      {/* State line */}
      <div className="border-b border-rule py-3 text-xs">
        <span className="font-semibold underline decoration-1 underline-offset-4">
          SEEDING (SEALED)
        </span>
        <span className="ml-3 text-muted">
          odds reveal when the card locks at trip start
        </span>
      </div>

      {/* Column heads */}
      <div className="hidden border-b border-rule py-2 text-xs text-muted sm:flex sm:items-baseline sm:gap-3">
        <span className="w-6 shrink-0" />
        <span className="min-w-0 flex-1">Market</span>
        <span className="w-20 shrink-0 text-right">Polymarket</span>
        <span className="w-20 shrink-0 text-right">Your stake</span>
      </div>

      <ol>
        {markets.map((market, i) => (
          <Row key={`${market.question}-${i}`} n={i + 1} market={market} />
        ))}
      </ol>

      {/* Slate foot */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 py-3 text-sm">
        <span className="text-muted">
          Total pool{" "}
          <span className="ml-1 font-mono text-foreground">{POOL_MASK}</span>
        </span>
        <span className="text-muted">
          Participants{" "}
          <span className="ml-1 font-mono text-foreground tabular-nums">
            {PARTICIPANTS}
          </span>
        </span>
      </div>
    </section>
  );
}

function Row({ n, market }: { n: number; market: SlateMarket }) {
  const num = String(n).padStart(2, "0");

  return (
    <li className="border-b border-rule py-4">
      <div className="flex items-baseline gap-3">
        <span className="w-6 shrink-0 font-mono text-sm text-muted tabular-nums">
          {num}
        </span>

        <div className="min-w-0 flex-1">
          <p className="leading-snug">{market.question}</p>
          <p className="mt-1 text-xs text-muted">
            {market.category} · {market.side} · closes{" "}
            {formatDate(market.closes)}
          </p>

          {/* Stacked figures on narrow screens */}
          <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted sm:hidden">
            <span>
              Polymarket{" "}
              <span className="font-mono text-foreground tabular-nums">
                {market.probability}%
              </span>
            </span>
            <span>
              Your stake <span className="font-mono">{MASK}</span>
            </span>
          </div>
        </div>

        <span className="hidden w-20 shrink-0 text-right font-mono tabular-nums sm:block">
          {market.probability}%
        </span>
        <span
          className="hidden w-20 shrink-0 text-right font-mono text-muted sm:block"
          title="Sealed until the card locks"
        >
          {MASK}
        </span>
      </div>
    </li>
  );
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(iso));
}

function formatRange(startIso: string, endIso: string): string {
  const end = new Date(endIso);
  const year = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    timeZone: "UTC",
  }).format(end);
  return `${formatDate(startIso)} – ${formatDate(endIso)}, ${year}`;
}
