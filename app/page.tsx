"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Masthead, Nav, Shell, SectionLabel } from "./shell";

// Hardcoded demo market. No market logic anywhere — these numbers are props.
// Fractional odds are the conventional approximations of the implied
// percentages: 15/8 = 34.8%, 1/2 = 66.7%.
const MARKET = {
  id: "0007",
  status: "Open",
  tag: "CAMPING TRIP",
  question: "Will [redacted] get to the office before 10am tomorrow?",
  yes: 34,
  no: 66,
  yesOdds: "15/8",
  noOdds: "1/2",
  pool: 124,
  bettors: 9,
  closes: "Aug 14",
  closesIn: "1d",
  // YES drifting down from ~53% to 34% over the last week. Purely decorative.
  spark: [
    [0, 28],
    [25, 24],
    [50, 31],
    [75, 22],
    [100, 26],
    [125, 18],
    [150, 30],
    [175, 27],
    [200, 36],
    [225, 32],
    [250, 40],
    [275, 37],
    [300, 40],
  ] as const,
};

const STEPS = [
  {
    n: "01",
    title: "Propose a market",
    body: "Anything with a yes-or-no answer and a date. If the group chat argued about it, it qualifies.",
  },
  {
    n: "02",
    title: "Seed it blind",
    body: "Stake either side with no prices shown. Odds don't exist yet, so there is nothing to follow and nothing to anchor to.",
  },
  {
    n: "03",
    title: "Odds reveal",
    body: "The window shuts, the pools open up, and staking continues at the pool ratio until the market closes.",
  },
  {
    n: "04",
    title: "Pool pays the winners",
    body: "At resolution the whole pool splits across the correct side, proportional to what each person staked.",
  },
];

// Lifecycle states, in order. The example market sits in the middle one.
const LIFECYCLE = ["Seeding", "Open", "Closed"] as const;

export default function Home() {
  return (
    <main className="flex-1">
      <Masthead />
      <Hero />
      <MarketSection />
      <HowItWorks />
      <ClosingCTA />
      <Footer />
    </main>
  );
}

function Hero() {
  return (
    <section className="border-b border-rule">
      <div className="broadsheet-full">
        <div className="py-24 sm:py-32 lg:py-40">
          <h1 className="type-hero ink-sweep text-balance">
            Prediction markets on the bets your group chat was already talking
            about.
          </h1>

          {/* Two doors, and the copy names the situation the visitor is
              actually in rather than the record we are about to write. */}
          <div className="mt-14 flex flex-col gap-x-14 gap-y-10 lg:flex-row lg:items-start">
            <div>
              <Link
                href="/start"
                className="inline-flex h-12 items-center bg-foreground px-7 text-base text-background transition-opacity hover:opacity-80"
              >
                Start a group
              </Link>
              <p className="mt-3 text-sm text-muted">
                Free, takes a minute. Invite the chat after.
              </p>
            </div>

            <div className="lg:border-l lg:border-rule lg:pl-14">
              <InviteCode />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * The invited-friend path, which is most of launch-night traffic: someone was
 * sent a code in a group chat. Taking the code here rather than on /join saves
 * a page load, and the code is only half the credential — the password still
 * gets asked for on the next screen, so nothing is weakened by accepting it
 * on a public page.
 */
function InviteCode() {
  const router = useRouter();
  const [code, setCode] = useState("");

  // Codes get read aloud and retyped, so forgive case, spaces, and the dash.
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, "");

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!clean) return;
    router.push(`/join/${clean}`);
  }

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="invite" className="block text-base">
        Got a code from a friend?
      </label>

      <div className="mt-3 flex gap-2">
        <input
          id="invite"
          name="invite"
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="K7QM-3XPD"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={9}
          className="h-12 w-[11ch] border border-rule bg-background px-3 font-mono text-base tracking-wider uppercase placeholder:tracking-wider placeholder:text-muted focus:border-foreground focus:outline-none"
        />
        <button
          type="submit"
          disabled={!clean}
          className="h-12 border border-foreground px-6 text-base transition-opacity hover:opacity-60 disabled:opacity-30"
        >
          Join
        </button>
      </div>

      <p className="mt-3 text-sm text-muted">
        No code? Ask whoever started the group.
      </p>
    </form>
  );
}

function MarketSection() {
  return (
    <section className="border-b border-rule">
      <Shell>
        <div className="grid gap-x-12 gap-y-12 py-20 sm:py-24 lg:grid-cols-12 lg:py-32">
          <div className="lg:col-span-4">
            <SectionLabel>Live market</SectionLabel>
            <h2 className="type-head mt-3 text-balance">
              Someone already opened this one.
            </h2>
            <p className="measure mt-5 leading-relaxed text-muted">
              Odds are just the pool ratio. Nobody is quoting you a price.
            </p>
          </div>

          <div className="lg:col-span-7 lg:col-start-6">
            <div className="max-w-[560px]">
              <MarketTable />
            </div>
          </div>
        </div>
      </Shell>
    </section>
  );
}

function MarketTable() {
  const {
    yes,
    no,
    yesOdds,
    noOdds,
    pool,
    bettors,
    closes,
    closesIn,
    question,
    tag,
    id,
    status,
  } = MARKET;

  return (
    <div>
      {/* A table from a working paper: rules top and bottom, hairlines within. */}
      <article className="border-t border-b border-foreground">
        <div className="flex items-baseline justify-between gap-4 border-b border-rule py-3 text-xs text-muted">
          <span className="font-mono tabular-nums">{id}</span>
          <span>{tag}</span>
        </div>

        {/* Lifecycle. Current state carries weight and an underline, never colour. */}
        <div className="flex flex-wrap items-baseline gap-2 border-b border-rule py-3 text-xs">
          {LIFECYCLE.map((state, i) => (
            <span key={state} className="flex items-baseline gap-2">
              {i > 0 && <span className="text-muted">→</span>}
              <span
                className={
                  state === status
                    ? "font-semibold underline decoration-1 underline-offset-4"
                    : "text-muted"
                }
                aria-current={state === status ? "true" : undefined}
              >
                {state}
              </span>
            </span>
          ))}
        </div>

        <div className="border-b border-rule py-5">
          <h3 className="text-lg leading-snug font-medium text-balance sm:text-xl">
            {question}
          </h3>
        </div>

        {/* Sides are told apart by weight and underline, never by colour. */}
        <SideRow side="Yes" odds={yesOdds} percent={yes} affirmative />
        <SideRow side="No" odds={noOdds} percent={no} />

        <div className="border-b border-rule py-5">
          <div className="mb-4 text-xs text-muted">Movement</div>
          <MovementLine />
          <div className="mt-3 flex justify-between text-xs text-muted">
            <span>7d ago</span>
            <span>now</span>
          </div>
        </div>

        <dl>
          <StatRow label="Pool" value={`$${pool}`} />
          <StatRow label="Bettors" value={String(bettors)} />
          <StatRow label="Closes" value={`${closes} · ${closesIn} left`} last />
        </dl>
      </article>

      {/* Table note */}
      <p className="mt-3 text-xs text-muted">
        Retain this portion. Stakes are in points and are not redeemable.
      </p>
    </div>
  );
}

function SideRow({
  side,
  odds,
  percent,
  affirmative = false,
}: {
  side: string;
  odds: string;
  percent: number;
  affirmative?: boolean;
}) {
  return (
    <div className="grid grid-cols-[1fr_5rem_4rem] items-baseline gap-x-4 border-b border-rule py-3">
      <span
        className={
          affirmative
            ? "font-semibold underline decoration-1 underline-offset-4"
            : "font-normal"
        }
      >
        {side}
      </span>
      <span className="text-right font-mono tabular-nums">{odds}</span>
      <span className="text-right font-mono text-muted tabular-nums">
        {percent}%
      </span>
    </div>
  );
}

function MovementLine() {
  const path = MARKET.spark.map(([x, y]) => `${x},${y}`).join(" ");

  return (
    <svg
      viewBox="0 0 300 60"
      preserveAspectRatio="none"
      className="h-12 w-full sm:h-14"
      aria-label="YES odds have drifted down over the past week"
    >
      <polyline
        points={path}
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function StatRow({
  label,
  value,
  last = false,
}: {
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-4 py-2.5 ${
        last ? "" : "border-b border-rule"
      }`}
    >
      <dt className="text-muted">{label}</dt>
      <dd className="font-mono tabular-nums">{value}</dd>
    </div>
  );
}

function HowItWorks() {
  return (
    <section className="border-b border-rule">
      <Shell>
        <div className="py-20 sm:py-24 lg:py-32">
          <SectionLabel>How it works</SectionLabel>
          <h2 className="type-head mt-3 mb-12 lg:mb-16">
            Three steps. That&apos;s the whole product.
          </h2>

          <ol className="sm:grid sm:grid-cols-2 sm:gap-x-8 lg:grid-cols-4 lg:gap-x-0">
            {STEPS.map((step) => (
              <li
                key={step.n}
                className="border-t border-rule py-8 lg:border-t-0 lg:border-l lg:border-rule lg:px-8 lg:py-0 lg:first:border-l-0 lg:first:pl-0"
              >
                <span className="font-mono text-sm text-muted tabular-nums">
                  {step.n}
                </span>
                <h3 className="mt-4 font-medium">{step.title}</h3>
                <p className="measure mt-2 leading-relaxed text-muted">
                  {step.body}
                </p>
              </li>
            ))}
          </ol>

          <p className="measure mt-14 leading-relaxed text-muted">
            No cash-outs. No market makers. Odds are just the pool ratio — if
            they look wrong, that&apos;s not a bug, that&apos;s your friends.
          </p>
        </div>
      </Shell>
    </section>
  );
}

/* Removing the waitlist took the last call to action off the bottom of the
   page. Anyone who reads to the end has already decided; they should not have
   to scroll back up to act on it. */
function ClosingCTA() {
  return (
    <section className="border-b border-rule">
      <Shell>
        <div className="flex flex-col items-center py-20 text-center sm:py-24">
          <h2 className="type-head max-w-[24ch] text-balance">
            Your group chat already made the bet. This is where it settles.
          </h2>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-x-7 gap-y-4">
            <Link
              href="/start"
              className="inline-flex h-12 items-center bg-foreground px-7 text-base text-background transition-opacity hover:opacity-80"
            >
              Start a group
            </Link>
            <Link
              href="/join"
              className="text-base text-muted hover:text-foreground"
            >
              I have a code
            </Link>
          </div>
        </div>
      </Shell>
    </section>
  );
}

function Footer() {
  return (
    <footer>
      <Shell>
        <div className="flex flex-wrap items-baseline justify-between gap-4 py-8">
          <Nav />
          <span className="text-sm text-muted">
            Points only. Settle your own Venmo beef.
          </span>
        </div>
      </Shell>
    </footer>
  );
}
