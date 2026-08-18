import { Masthead, Nav, Shell } from "../shell";

/**
 * Stands in for the whole /bundles subtree while NEXT_PUBLIC_BUNDLES_LIVE is
 * off. Rendered by the index and by every trip page, so a deep link to a
 * bundle can't walk around the gate.
 */
export function ComingSoon() {
  return (
    <main className="flex-1">
      <Masthead up="/" current="bundles" />

      <Shell>
        <div className="flex min-h-[60vh] flex-col items-center justify-center py-24 text-center">
          <span className="font-mono text-xs tracking-[0.2em] text-muted uppercase">
            Coming soon
          </span>

          <h1 className="type-statement mt-5 text-balance">Market Bundles</h1>

          <p className="mt-6 max-w-[40ch] leading-relaxed text-muted">
            Curated public markets that resolve inside one trip window, staked
            blind against each other. Not open yet.
          </p>
        </div>
      </Shell>

      <footer className="border-t border-rule">
        <Shell>
          <div className="flex flex-wrap items-baseline justify-between gap-4 py-8">
            <Nav current="bundles" />
            <span className="text-sm text-muted">
              Points only. Settle your own Venmo beef.
            </span>
          </div>
        </Shell>
      </footer>
    </main>
  );
}
