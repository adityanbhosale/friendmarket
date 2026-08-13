import type { Slate, SlateMarket } from "./markets";

const MASK = "▮▮▮";
const POOL_MASK = "▮▮▮▮▮";
const PARTICIPANTS = 11;

export function SlateTable({ slate }: { slate: Slate }) {
  const { trip, window, markets } = slate;

  return (
    <section className="border-t border-b border-foreground">
      {/* Slate head */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-b border-rule py-3 text-xs">
        <span className="font-mono tabular-nums">SLATE NO. {trip.no}</span>
        <span className="text-muted">
          {trip.name} · {formatRange(window.start, window.end)}
        </span>
      </div>

      {/* State line */}
      <div className="border-b border-rule py-3 text-xs">
        <span className="font-semibold underline decoration-1 underline-offset-4">
          SEEDING (SEALED)
        </span>
        <span className="ml-3 text-muted">
          odds reveal when the slate locks at trip start
        </span>
      </div>

      {slate.thinRegional && (
        <div className="border-b border-rule py-3 text-xs text-muted">
          Thin regional coverage this window — slate leans national.
        </div>
      )}

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
            <span
              className={
                market.origin === "regional"
                  ? "font-semibold text-foreground"
                  : undefined
              }
            >
              {market.origin}
            </span>
            {" · "}
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
          title="Sealed until the slate locks"
        >
          {MASK}
        </span>
      </div>
    </li>
  );
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(iso));
}

export function formatRange(startIso: string, endIso: string): string {
  const end = new Date(endIso);
  const year = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    timeZone: "UTC",
  }).format(end);
  return `${formatDate(startIso)} – ${formatDate(endIso)}, ${year}`;
}
