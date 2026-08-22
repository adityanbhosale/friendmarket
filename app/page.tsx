"use client";

import Link from "next/link";
import { useActionState, useLayoutEffect, useRef } from "react";
import { Masthead, Nav, Shell } from "./shell";
import { goToGroupJoin, type FormState } from "./lib/actions";

// Hardcoded demo market. No market logic anywhere — these numbers are props.
// Fractional odds are the conventional approximations of the implied
// percentages: 15/8 = 34.8%, 1/2 = 66.7%.
const MARKET = {
  id: "0007",
  status: "Open",
  tag: "Spreak '26 - Dublin, Ireland",
  question: "Will [_____] get into a bar fight at Temple Bar?",
  yes: 34,
  no: 66,
  yesOdds: "15/8",
  noOdds: "1/2",
  pool: 124,
  bettors: 9,
  closes: "Mar 14",
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
      <LaunchBar />
      <Hero />
      <MarketSection />
      <HowItWorks />
      <ClosingCTA />
      <Footer />
    </main>
  );
}

const HEADLINE =
  "Private prediction markets on the bets your group chat was already talking about.";

/**
 * Renders a sentence one word per element so each can be delayed in reading
 * order. The words are real text in the server-rendered HTML — the animation
 * only moves them, so crawlers and a failed stylesheet both still see the
 * sentence.
 */
function StaggeredWords({ text }: { text: string }) {
  const words = text.split(" ");

  return (
    <>
      {words.map((word, i) => (
        <span key={`${word}-${i}`}>
          <span
            className="word-in"
            // 45ms apart: fast enough to read as one motion, slow enough that
            // the direction is legible.
            style={{ animationDelay: `${i * 45}ms` }}
          >
            {word}
          </span>
          {i < words.length - 1 ? " " : null}
        </span>
      ))}
    </>
  );
}

// Shown as a running tape under the headline. House style is a blank rather
// than a name — these render on a public page, and "Will [_____]" is a joke
// about a type of friend, where a real name would be a joke about a person.
const TAPE = [
  { q: "Will [_____] text their ex before 2am?", p: 71 },
  { q: "Does anyone actually make it to the 8:30am?", p: 12 },
  { q: "Will [_____] change their major again this semester?", p: 44 },
  { q: "Does the Venmo request get paid inside a week?", p: 23 },
  { q: "Will [_____] say 'never drinking again' before Sunday?", p: 88 },
  { q: "Does the group chat survive the trip?", p: 61 },
  { q: "Will [_____] lose their ID for the third time?", p: 37 },
  { q: "Does the thing in the back of the fridge get thrown out this month?", p: 9 },
  { q: "Will the 'one quiet drink' end after 1am?", p: 79 },
  { q: "Does [_____] make it to the gym three days running?", p: 18 },
  { q: "Will someone cry at the formal?", p: 66 },
  { q: "Does anyone remember to cancel the free trial?", p: 14 },
  { q: "Will [_____] show up to lecture in yesterday's clothes?", p: 52 },
  { q: "Does the group study session involve any studying?", p: 21 },
  { q: "Will [_____] reply 'omw' while still in bed?", p: 93 },
  { q: "Does the roommate thermostat war reach a truce?", p: 27 },
];

/**
 * A tape of example markets. Not live and not pretending to be — the point is
 * to show what a question looks like here, in the tone people actually write
 * them in, before anyone has to imagine one themselves.
 *
 * The list renders twice: the animation slides the track exactly half its
 * width, so the copy arrives precisely where the original started and the loop
 * has no visible seam. The second copy is decorative, so it is hidden from
 * assistive tech rather than read out again.
 */
function MarketTape() {
  return (
    <div className="ticker border-y border-rule select-none">
      <div className="ticker-track">
        <TapeRun />
        <TapeRun ariaHidden />
      </div>
    </div>
  );
}

function TapeRun({ ariaHidden = false }: { ariaHidden?: boolean }) {
  return (
    <ul
      className="flex shrink-0"
      aria-hidden={ariaHidden || undefined}
      aria-label={ariaHidden ? undefined : "Example markets"}
    >
      {TAPE.map(({ q, p }, i) => (
        <li
          key={`${q}-${i}`}
          className="flex shrink-0 items-baseline gap-3 border-r border-rule px-6 py-3.5"
        >
          <span className="font-mono text-xs text-muted tabular-nums">
            {String(p).padStart(2, "0")}%
          </span>
          <span className="text-sm whitespace-nowrap">{q}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * A standing bar of school marks under the masthead, running continuously.
 *
 * Each school appears as its own mark rather than a wordmark: Penn's shield,
 * NYU's torch over the letters, Purdue's P, Stanford's tree, Yale's shield.
 * They keep their brand colours — a shield in the wrong colour is not that
 * school's shield.
 *
 * NYU's lock-up is assembled here. The file published as the NYU logo draws
 * the torch block and "NEW YORK UNIVERSITY" as one path side by side, so the
 * viewBox is cropped to the block — which leaves the lettering outside the
 * viewport, where the root clips it — and the letters are set underneath in
 * the page's own type.
 *
 * Heights are per mark, not shared: Stanford is tall and narrow at about
 * 2:3 while Purdue's P is wide at nearly 2:1, and one height for all five
 * makes some tower and others vanish.
 */
const SCHOOLS = [
  { name: "University of Pennsylvania", src: "/logos/penn-shield.svg", w: 21, h: 24 },
  { name: "New York University", torch: true, w: 18, h: 18 },
  { name: "Purdue University", src: "/logos/purdue-p.svg", w: 32, h: 17 },
  { name: "Stanford University", src: "/logos/stanford.svg", w: 17, h: 26 },
  { name: "Yale University", src: "/logos/yale.svg", w: 27, h: 28 },
];

const NYU_VIOLET = "#57068C";

/**
 * Five marks are not enough to fill a wide screen twice over, and the loop
 * only reads as seamless when the track is at least double the viewport and
 * slides exactly half its own width. Repeating the run gets it past that on
 * an ultrawide display; the images are one cached file each, so the cost is
 * DOM nodes rather than bytes.
 */
const RUNS = 10;

function LaunchBar() {
  return (
    <div className="ticker border-b border-rule">
      <div className="ticker-track" style={{ animationDuration: "38s" }}>
        {Array.from({ length: RUNS }, (_, i) => (
          <SchoolRun key={i} ariaHidden={i > 0} />
        ))}
      </div>
    </div>
  );
}

function SchoolRun({ ariaHidden = false }: { ariaHidden?: boolean }) {
  return (
    <ul
      className="flex shrink-0 items-center"
      aria-hidden={ariaHidden || undefined}
      aria-label={ariaHidden ? undefined : "Launching at"}
    >
      {SCHOOLS.map((school) => (
        <li
          key={school.name}
          className="flex h-11 shrink-0 items-center justify-center px-12"
        >
          {school.torch ? (
            <span
              role="img"
              aria-label={ariaHidden ? undefined : school.name}
              className="flex flex-col items-center leading-none"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logos/nyu-torch.svg"
                alt=""
                width={school.w}
                height={school.h}
                style={{ width: school.w, height: school.h }}
              />
              <span
                className="mt-[3px] text-[8px] font-bold tracking-[0.06em]"
                style={{ color: NYU_VIOLET }}
              >
                NYU
              </span>
            </span>
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={school.src}
              alt={ariaHidden ? "" : school.name}
              width={school.w}
              height={school.h}
              style={{ width: school.w, height: school.h }}
            />
          )}
        </li>
      ))}
    </ul>
  );
}

function Hero() {
  return (
    <section className="border-b border-rule">
      <div className="broadsheet-full">
        <div className="pt-20 sm:pt-24 lg:pt-28">
          <h1 className="type-hero text-balance">
            <StaggeredWords text={HEADLINE} />
          </h1>
        </div>
      </div>

      {/* Runs edge to edge, so it sits outside the gutters the rest of the
          page keeps. Trimmed the hero's padding to pay for the height rather
          than pushing the buttons off the first screen. */}
      <div className="mt-14">
        <MarketTape />
      </div>

      <div className="broadsheet-full">
        <div className="pt-12 pb-20 sm:pb-24 lg:pb-28">
          {/* Two doors, and the copy names the situation the visitor is
              actually in rather than the record we are about to write. */}
          <div className="flex flex-col gap-x-14 gap-y-10 lg:flex-row lg:items-start">
            <div>
              <Link
                href="/start"
                className="inline-flex h-12 items-center bg-foreground px-7 text-base text-background transition-opacity hover:opacity-80"
              >
                Start your group chat
              </Link>
              <p className="mt-3 text-sm text-muted">
                Takes a minute. Then invite your friends.
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
  const [state, action, pending] = useActionState<FormState, FormData>(
    goToGroupJoin,
    {},
  );

  return (
    <form action={action}>
      <label htmlFor="invite" className="block text-base">
        Got a code from a friend?
      </label>

      <div className="mt-3 flex gap-2">
        <input
          id="invite"
          name="group_code"
          type="text"
          placeholder="K7QM-3XPD"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={40}
          className="h-12 w-[11ch] border border-rule bg-background px-3 font-mono text-base tracking-wider uppercase placeholder:tracking-wider placeholder:text-muted focus:border-foreground focus:outline-none"
        />
        <button
          type="submit"
          disabled={pending}
          className="h-12 border border-foreground px-6 text-base transition-opacity hover:opacity-60 disabled:opacity-30"
        >
          {pending ? "…" : "Join"}
        </button>
      </div>

      <p className="mt-3 text-sm text-muted">
        {state.error ?? "No code? Ask whoever started the group."}
      </p>
    </form>
  );
}

/**
 * Split-flap reveal for a heading.
 *
 * Plays when the heading scrolls into view, not on mount: both of these sit
 * below the fold, and an entrance that finishes before anyone can see it is
 * just an invisible heading.
 *
 * The armed state is set in a layout effect rather than in the initial render
 * so the server sends a heading that is simply visible. Without scripting the
 * text stays put; with it, the class lands before the browser paints, and
 * these are off-screen at that point anyway.
 */
function FlipHeading({
  text,
  className = "",
  step = 26,
}: {
  text: string;
  className?: string;
  step?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  // Classes are toggled on the node rather than held in state: this drives an
  // animation, nothing else renders from it, and a state update here would be
  // a re-render of the whole heading to change one attribute.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (typeof IntersectionObserver === "undefined") {
      el.classList.add("flip-play");
      return;
    }

    el.classList.add("flip-armed");
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          el.classList.remove("flip-armed");
          el.classList.add("flip-play");
          io.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const words = text.split(" ");
  let n = 0;

  return (
    // Split into characters, a screen reader can announce it letter by
    // letter. The label carries the phrase; the flaps are decoration.
    <span
      ref={ref}
      aria-label={text}
      className={`flip-line ${className}`}
    >
      {words.map((word, w) => (
        <span key={`${word}-${w}`} aria-hidden="true">
          {/* Whole words stay unbreakable so a flap never splits mid-word. */}
          <span className="inline-block whitespace-nowrap">
            {[...word].map((ch, c) => (
              <span
                key={c}
                className="flip-char"
                style={{ animationDelay: `${n++ * step}ms` }}
              >
                {ch}
              </span>
            ))}
          </span>
          {w < words.length - 1 ? " " : null}
        </span>
      ))}
    </span>
  );
}

function MarketSection() {
  return (
    <section className="border-b border-rule">
      <Shell>
        <div className="grid gap-x-12 gap-y-12 py-20 sm:py-24 lg:grid-cols-12 lg:py-32">
          <div className="lg:col-span-4">
            <h2 className="type-head text-balance">
              <FlipHeading text="Example Market" />
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
          <h2 className="type-head mb-12 lg:mb-16">
            <FlipHeading text="How it works. 4 Steps" />
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
              Start your group chat
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
