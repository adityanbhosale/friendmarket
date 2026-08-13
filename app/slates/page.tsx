import type { Metadata } from "next";
import Link from "next/link";
import { Nav, Shell } from "../shell";
import { TRIPS, tripWindow } from "./markets";
import { formatRange } from "./slate-table";

export const metadata: Metadata = {
  title: "Slates — Sidebar",
  description:
    "Mock trip slates: curated public prediction markets resolving inside one trip window, staked blind against each other.",
};

export default function SlatesIndex() {
  const now = new Date();

  return (
    <main className="flex-1">
      <div className="border-b border-rule">
        <Shell>
          <div className="flex items-baseline justify-between gap-6 py-5">
            <Link href="/" className="type-wordmark font-medium hover:text-muted">
              Sidebar
            </Link>
            <Nav current="slates" />
          </div>
        </Shell>
      </div>

      <Shell>
        <div className="py-16 sm:py-20 lg:py-24">
          <h1 className="type-statement max-w-[18ch] text-balance">
            A slate of real markets, staked blind.
          </h1>

          <div className="measure mt-8 space-y-4 leading-relaxed">
            <p>
              The group is not trading against the world. Polymarket&apos;s
              price is the consensus — the number to disagree with — and the
              real bet is against each other&apos;s read of it.
            </p>
            <p>
              Stakes stay sealed until the slate locks at the start of the trip,
              so nobody is following anybody. Whoever reads their
              friends&apos; blind spots best takes the pool.
            </p>
            <p>
              Each slate leans on the markets nearest the destination, then
              fills out nationally.
            </p>
          </div>

          <ol className="mt-14 max-w-[820px] border-t border-foreground">
            {TRIPS.map((trip) => {
              const window = tripWindow(trip, now);
              return (
                <li key={trip.slug} className="border-b border-rule">
                  <Link
                    href={`/slates/${trip.slug}`}
                    className="group flex items-baseline gap-4 py-5"
                  >
                    <span className="w-8 shrink-0 font-mono text-sm text-muted tabular-nums">
                      {trip.no}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-lg font-medium underline decoration-rule decoration-1 underline-offset-4 group-hover:decoration-foreground">
                        {trip.name}
                      </span>
                      <span className="mt-1 block text-sm text-muted">
                        {trip.destination}
                      </span>
                      <span className="mt-2 block text-sm text-muted italic">
                        {trip.note}
                      </span>
                    </span>
                    <span className="hidden shrink-0 text-right font-mono text-xs text-muted tabular-nums sm:block">
                      {formatRange(window.start, window.end)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>

          <p className="mt-6 max-w-[820px] text-sm text-muted">
            Optional side pot: one three-leg parlay per person, longest
            surviving odds takes it.
          </p>
        </div>
      </Shell>

      <footer className="border-t border-rule">
        <Shell>
          <div className="flex flex-wrap items-baseline justify-between gap-4 py-8">
            <Nav current="slates" />
            <span className="text-sm text-muted">
              Points only. Settle your own Venmo beef.
            </span>
          </div>
        </Shell>
      </footer>
    </main>
  );
}
