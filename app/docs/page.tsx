import type { Metadata } from "next";
import { Masthead, Nav, Shell, SectionLabel } from "../shell";

export const metadata: Metadata = {
  title: "Rules — Sidebar",
  description:
    "The complete market structure specification: parimutuel pools, pricing, resolution, disputes, and settlement.",
};

const CONTENTS = [
  { n: "1", id: "principles", title: "Principles" },
  { n: "2", id: "pool", title: "The pool" },
  { n: "3", id: "pricing", title: "Pricing" },
  { n: "4", id: "sealed-seeding", title: "Sealed seeding" },
  { n: "5", id: "slates", title: "Market Bundles" },
  { n: "6", id: "sourcing", title: "Sourcing and selection" },
  { n: "7", id: "no-maker", title: "Why there is no market maker" },
  { n: "8", id: "matched-book", title: "Considered and rejected: matched book" },
  { n: "9", id: "timing", title: "Timing" },
  { n: "10", id: "resolution", title: "Resolution and disputes" },
  { n: "11", id: "house-rules", title: "House rules" },
  { n: "12", id: "settlement", title: "Settlement" },
];

export default function Docs() {
  return (
    <main className="flex-1">
      <DocsHeader />

      <Shell>
        <div className="py-16 lg:grid lg:grid-cols-12 lg:gap-x-12 lg:py-24">
          <aside className="lg:sticky lg:top-10 lg:col-span-3 lg:self-start">
            <Contents />
          </aside>

          <div className="measure mt-16 lg:col-span-7 lg:col-start-5 lg:mt-0">
            <Section id="principles" n="1" title="Principles">
              <P>
                The venue is invite-only and denominated in points. It does not
                touch money, hold money, or know anything about your money.
              </P>
              <P>
                Every market is a self-contained pool. It opens, takes stakes,
                closes, resolves, and pays out without reference to any other
                market on the board.
              </P>
              <P>
                There is no market maker and no order book. The venue never
                quotes a price, never takes the other side of your bet, and
                never holds inventory. What the interface calls a price is an
                accounting identity — the ratio of one pool to the total,
                recomputed after every stake. Nobody is offering it to you. It
                is simply what the points already in the pool say.
              </P>
            </Section>

            <Section id="pool" n="2" title="The pool">
              <SubSection n="2.1" title="Parimutuel law" />
              <P>
                Each market has two pools: YES and NO. Staking adds points to
                one of them. A stake is irrevocable — it cannot be cancelled,
                reduced, cashed out, or transferred to another person or the
                other side. Once it is in, it is in until resolution.
              </P>
              <P>
                A market has one pool per side. Often those sides are YES and
                NO, but a market may instead be a head-to-head between two
                named outcomes — one team against another — in which case the
                pools carry those names. The mechanics do not change: one pool
                per side, and YES/NO is simply the case where the two sides
                happen to be called yes and no.
              </P>
              <P>
                At resolution the entire combined pool — both sides — is
                distributed to the winning side, pro-rata by stake.
              </P>

              <Formula>
                payout<Sub>i</Sub> = stake<Sub>i</Sub> × ( total pool ÷ winning
                pool )
              </Formula>

              <Table caption="Worked example">
                <Row label="A stakes on Yes" value="8" />
                <Row label="B stakes on No" value="16" />
                <Row label="Total pool" value="24" strong />
                <Row label="Implied odds" value="Yes 33% · No 67%" />
              </Table>

              <Table caption="Settlement, either way">
                <Row label="Yes resolves true — A receives" value="24" />
                <Row label="A’s profit" value="+16" strong />
                <Row label="No resolves true — B receives" value="24" />
                <Row label="B’s profit" value="+8" strong />
              </Table>

              <P>
                Note what that means. A risked 8 to make 16. B risked 16 to make
                8. Your profit scales <em>inversely</em> with how many people
                agreed with you: being right in a crowd pays badly, being right
                alone pays well. That is not a defect in the mechanism. That is
                the entire point of it, and it is the reason a market is worth
                reading at all.
              </P>
              <P>
                The formula needs both sides to exist. If either pool is zero at
                close — everybody agreed, or nobody took the other side — there
                is no losing stake to distribute and no ratio to distribute it
                by. The market is voided and all stakes are refunded in full.
              </P>
            </Section>

            <Section id="pricing" n="3" title="Pricing">
              <P>
                The implied probability of YES is the YES pool divided by the
                total pool, recomputed on every stake. It is displayed as a
                percentage and as the nearest conventional fractional odds,
                because a number written 15/8 is harder to mistake for a promise
                than a number written 34%.
              </P>

              <Formula>implied P(Yes) = Yes pool ÷ total pool</Formula>

              <P>
                Your own stake moves the price against you. A large stake on YES
                raises the implied probability of YES, so the number standing
                after you commit will be worse than the number that tempted you.
                With fifteen to twenty participants and pools in the low
                hundreds, this self-impact is material rather than theoretical.
                It is disclosed here rather than buried in a settlement screen.
              </P>
              <P>
                There is no slippage protection, no limit order, and no
                fill-or-kill. There is nothing to slip against. You are not
                trading with a counterparty who might move before you land; you
                are adding points to a bucket.
              </P>
            </Section>

            <Section id="sealed-seeding" n="4" title="Sealed seeding">
              <P>
                Every market runs through three trading states. The first of
                them is blind.
              </P>

              <SubSection n="4.1" title="The three states" />
              <Table caption="Lifecycle">
                <Row label="Seeding" value="stakes accepted, nothing shown" />
                <Row label="Open" value="pools revealed, odds published" />
                <Row label="Closed / Resolved" value="no stakes, outcome run" />
              </Table>
              <P>
                <strong>Seeding</strong> is a fixed window that starts the
                moment the market is proposed. The proposer sets its length.
                During the window anyone may stake on either side, but no
                prices, pool sizes, side totals, or individual positions are
                displayed to anyone. A stake placed during seeding is
                irrevocable on the same terms as any other stake, with one
                difference: you may increase it before the window shuts.
              </P>
              <P>
                <strong>Open</strong> begins when the seeding window ends. The
                pools are revealed, the implied odds are published as the pool
                ratio, and staking continues at visible odds until close exactly
                as specified above.
              </P>
              <P>
                <strong>Closed</strong> and <strong>resolved</strong> are
                unchanged. No stakes are accepted after close, and the outcome
                runs at resolution.
              </P>

              <SubSection n="4.2" title="Why the window is sealed" />
              <P>
                In a venue of fifteen people, the first number anybody sees is
                the number everybody else reasons from. Publish an opening ratio
                and it anchors the entire market behind it — not because your
                friends are credulous, but because a posted price is evidence,
                and in a small group it is most of the evidence available.
              </P>
              <P>
                Worse, an open ratio makes the first stakers pay for the
                privilege of being first. Under a pool, a stake moves the ratio
                against the person placing it. Early on there is no depth to
                absorb that, so the people doing the actual price discovery move
                the price furthest against themselves and hand the improved
                number to whoever arrives next. They subsidize the market.
              </P>
              <P>
                Sealing the window collects independent priors instead of a
                cascade. Everyone commits against their own read of the
                situation rather than against each other&apos;s, and what
                appears at the reveal is fifteen opinions rather than one
                opinion and fourteen echoes.
              </P>

              <SubSection n="4.3" title="Why seed rather than wait" />
              <P>
                Because the mispricing is captured at the reveal, and after that
                it is gone. If you seed and the crowd lands somewhere else, the
                reveal moves the ratio to your advantage and you are holding
                stake that was placed at a price nobody else could see. If you
                wait, you are taking the number the seeders produced.
              </P>
              <P>
                That is the whole trade. Seeding is when you set the price.
                Open is when you take it.
              </P>

              <SubSection n="4.4" title="What is visible during seeding" />
              <P>
                One number: how many participants have staked. Not which side
                they took, not how much, not in what order.
              </P>
              <P>
                The proposer has no privileged view. They see the participant
                count and nothing else, on the same terms as everybody else,
                including in markets they proposed and staked in themselves.
                There is no administrative screen behind this — the totals are
                not shown to anyone because a market that can be peeked at is
                not sealed, it is merely inconvenient.
              </P>
            </Section>

            <Section id="slates" n="5" title="Market Bundles">
              <P>
                A market bundle is a set of markets the venue did not write. They
                are sourced from a public prediction market, they share a trip
                window and a leaderboard, and they are presented together. That
                is the whole of the relationship.
              </P>

              <SubSection n="5.1" title="The coupling is presentational" />
              <P>
                Each market in a bundle keeps its own independent parimutuel
                pool, its own reveal, and its own settlement. Nothing multiplies
                across markets. Being right on six of eight does not compound —
                it means you were right in six separate pools and wrong in two.
              </P>
              <P>
                This is worth stating plainly, because a bundle looks like a
                parlay and is not one. A parlay couples at the <em>payoff</em>{" "}
                level: it pays on the joint outcome of every leg at once, so the
                thing being priced is a single point in the joint outcome space
                rather than each market on its own.
              </P>
              <P>That space is the problem.</P>

              <Formula>joint outcomes = 2^n</Formula>

              <Table caption="Joint outcome space by leg count">
                <Row label="3 legs" value="8" />
                <Row label="5 legs" value="32" />
                <Row label="8 legs — a full bundle" value="256" strong />
              </Table>

              <P>
                Fifteen people cannot populate 256 pools. A parimutuel pool with
                one staker on each side is not a market, it is a bet with extra
                steps. So the venue does not run parlay pools, and a bundle is
                not one.
              </P>
              <P>
                The parlay survives as the optional side pot: one n-leg parlay
                per person into a single shared pool, longest surviving odds
                takes it. One pool, one winner, no combinatorics.
              </P>

              <SubSection n="5.2" title="The trading phase" />
              <P>
                For external bundles, sealed seeding is not the first phase. It
                is the entire trading phase. The bundle locks before the trip
                window opens, odds reveal at lock, and no open trading follows.
              </P>
              <P>
                The reason is that the reference prices move publicly, in real
                time, on a venue anybody can read. Section 4 sealed the window
                so nobody could follow anybody. Leaving an open phase after the
                reveal would hand a late staker something better than a peek at
                the pool — it would hand them the public price after it had
                already moved, which is free-riding on information that arrived
                only after everybody else had committed.
              </P>
              <P>So for bundle markets the two timestamps collapse:</P>

              <Formula>reveal = close &lt; resolution</Formula>

              <P>
                The strict ordering in section 9 governs markets the group
                writes itself. Bundle markets relax it to the above, and nothing
                else about section 9 changes.
              </P>

              <SubSection n="5.3" title="Reference prices" />
              <P>
                The consensus column in a bundle is the external market’s traded
                price at snapshot, displayed as an implied probability.
              </P>
              <P>
                It is information. It is not a quote. Nobody here will trade
                with you at that number, and the venue’s own odds remain what
                they have always been — the ratio of the two pools, per section
                3. The external price is there to be disagreed with.
              </P>
              <P>
                Which is the actual game. In a bundle you are not trying to
                predict the world better than a liquid public market; you will
                usually lose that. You are reading which of your friends is
                wrong about where that market is wrong.
              </P>
            </Section>

            <Section id="sourcing" n="6" title="Sourcing and selection">
              <P>
                The methodology, written down so a bundle can be audited rather
                than trusted.
              </P>

              <SubSection n="6.1" title="Source" />
              <P>
                Polymarket’s public Gamma API, read-only and keyless. No orders
                are ever placed and no account exists. The external venue serves
                two functions and no others: price reference, and resolution
                oracle.
              </P>

              <SubSection n="6.2" title="The pool" />
              <P>
                Top-volume active markets, fetched in pages of one hundred and
                merged into a single pool shared by every bundle.
              </P>
              <Table caption="Pool construction">
                <Row label="Pages read" value="6 × 100 = 600" />
                <Row label="Ordering" value="volume, descending" />
                <Row label="Page failure" value="tolerated, pool degrades" strong />
                <Row label="Cache" value="revalidated hourly" />
                <Row label="Scope" value="one read, all bundles" />
              </Table>
              <P>
                Per-page failure tolerance matters more than it sounds: one
                failed page thins the pool rather than emptying the board.
              </P>

              <SubSection n="6.3" title="Filters" />
              <P>
                Two-outcome markets only — on the source venue that means either
                yes/no or a head-to-head between two named sides, as described
                in section 2.
              </P>
              <Table caption="Probability band">
                <Row label="National fill" value="5% – 95%" />
                <Row label="Regional match" value="3% – 97%" strong />
              </Table>
              <P>
                A market sitting at 99% leaves nothing to disagree about, and a
                bundle of near-certainties is a reading exercise rather than a
                game. Regional matches get the wider band because the
                head-to-heads are the draw.
              </P>
              <P>
                Near-duplicate markets are deduplicated. Public venues list
                price ladders — the same question at four strike prices — and
                without this step a bundle fills up with one question wearing
                four hats.
              </P>

              <SubSection n="6.4" title="Regional weighting" />
              <P>
                Each trip defines a keyword set: teams, cities, and state
                figures for the destination. Matching runs over the question
                text <em>and</em> the outcome names, because a market titled
                after one side still concerns the other.
              </P>
              <P>
                Matching uses word-boundary patterns rather than substring
                search. This is not fastidiousness: substring matching put a
                Mexican football club on a Texas bundle by way of “cruz”, and put
                the San Francisco Giants on a New York one. A regional tag that
                is wrong is worse than no tag at all.
              </P>
              <Table caption="Bundle composition">
                <Row label="Regional slots" value="up to 4" strong />
                <Row label="Remainder" value="category round-robin" />
                <Row label="In-window resolution" value="preferred, not required" />
              </Table>
              <P>
                In-window resolution is a preference because the pool is
                volume-ranked and clusters in the near term; requiring it would
                starve a window three weeks out. Where regional coverage is
                thin, the bundle says so on its face. It never fakes the tag.
              </P>

              <SubSection n="6.5" title="Failure, and one piece of staleness" />
              <P>
                If the source is unreachable, a static sample bundle renders in
                its place carrying a notice that says exactly that. A bundle
                never renders empty.
              </P>
              <P>
                One thing this demo does not do. The displayed consensus is a
                snapshot and may be up to an hour stale under the cache policy
                above. A production bundle would freeze every reference price at
                a single canonical lock timestamp, so that every participant is
                shown the same number and settlement can be audited against it.
                This one does not. It is a demo, and that is the first gap you
                would close.
              </P>
            </Section>

            <Section id="no-maker" n="7" title="Why there is no market maker">
              <P>
                The obvious objection: real prediction markets run automated
                market makers. Why not run one here?
              </P>
              <P>
                An automated market maker such as LMSR gives continuous
                two-sided quotes — you can always trade, in any size, at a
                posted price. This is genuinely useful and it is not free. LMSR
                is parameterised by a liquidity constant <Mono>b</Mono> that
                sets how far the price moves per unit traded. For a binary
                market the sponsor’s worst-case loss is{" "}
                <Mono>b·ln(2)</Mono>, and that is real money somebody posts up
                front and can actually lose. A market maker is not a machine
                that creates liquidity. It is a machine that converts a subsidy
                into liquidity.
              </P>
              <P>
                LS-LMSR, the liquidity-sensitive variant, scales <Mono>b</Mono>{" "}
                with volume so the subsidy is not fixed in advance. The
                trade-off is that early spreads are wide and the quoted prices
                sum to more than 1 — that excess is a vig, charged to the
                traders to fund the maker. It still requires an initial seed,
                and the sponsor can still lose it.
              </P>
              <P>
                With fifteen to twenty known participants there is no anonymous
                order flow to attract and no reason to pay for continuous
                liquidity. The people who want to bet are already in the group
                chat, they will bet within the day, and a parimutuel pool clears
                all of them without anyone posting a subsidy. So the venue does
                not run one.
              </P>

              <SubSection n="7.1" title="Seeding mechanics, for the record" />
              <P>
                Written down in case the venue ever grows enough to need one, so
                nobody has to rediscover it:
              </P>
              <Table caption="If an LS-LMSR were ever seeded">
                <Row label="Proposer posts seed" value="s" />
                <Row label="Initial liquidity constant" value="b = s ÷ ln(2)" />
                <Row label="Thereafter" value="b ∝ open interest" />
                <Row label="Sponsor loss" value="capped at s" strong />
                <Row label="At resolution" value="seed forfeited to the pool" />
              </Table>
              <P>
                Setting <Mono>b = s ÷ ln(2)</Mono> is not arbitrary: it makes
                the worst-case loss <Mono>b·ln(2)</Mono> come out to exactly{" "}
                <Mono>s</Mono>. The seed funds the worst case precisely, and
                nothing beyond the seed is ever at risk.
              </P>
            </Section>

            <Section
              id="matched-book"
              n="8"
              title="Considered and rejected: matched book"
            >
              <P>
                The alternative we looked at, and did not take: treat stakes
                like poker side pots. A stake pays out only to the extent it is
                matched by the opposing side, and anything unmatched is refunded
                at resolution.
              </P>
              <P>Same example, run through that rule instead:</P>

              <Table caption="Matched-book settlement">
                <Row label="A stakes on Yes" value="8" />
                <Row label="B stakes on No" value="16" />
                <Row label="Matched" value="8 v 8" strong />
                <Row label="B’s uncontested stake, refunded" value="8" />
                <Row label="Yes resolves true — A’s profit" value="+8" strong />
              </Table>

              <P>
                A makes 8 instead of 16. The rule is defensible and it is worse
                here, for three reasons:
              </P>
              <List>
                <Item>
                  <strong>Refund accounting adds states.</strong> Every stake
                  becomes partly live and partly pending-refund, and the split
                  changes every time somebody else stakes.
                </Item>
                <Item>
                  <strong>
                    Displayed odds stop predicting realized payout.
                  </strong>{" "}
                  The screen says one thing and the settlement says another.
                  That is the fastest available way to lose the group’s trust.
                </Item>
                <Item>
                  <strong>It penalises exactly the wrong people.</strong> The
                  early staker on the thin side — the one actually doing the
                  price discovery — is the one most likely to sit unmatched.
                </Item>
              </List>
              <P>
                One pool, one formula, one number on the screen that means what
                it says.
              </P>
            </Section>

            <Section id="timing" n="9" title="Timing">
              <P>
                Every market carries three timestamps, all fixed at proposal and
                none adjustable afterwards:
              </P>
              <Table caption="Fixed at proposal">
                <Row label="Reveal" value="seeding ends, pools revealed" />
                <Row label="Close" value="no stakes accepted after" />
                <Row label="Resolution" value="outcome determined, payout runs" />
              </Table>
              <P>
                The ordering is fixed and the interface will not accept a market
                that violates it:
              </P>
              <Formula>reveal &lt; close &lt; resolution</Formula>
              <P>
                Close must precede the earliest moment the outcome could become
                knowable. The proposer sets it and common sense checks it. This
                matters more here than at a venue with cash-outs, because there
                are none: a stake placed at the last second against an outcome
                that is already effectively known is not a clever trade. It is a
                transfer out of the pockets of everyone who bet earlier and
                honestly.
              </P>
              <P>
                Set the close early. If in doubt, earlier. Betting after close
                is impossible by construction, not by etiquette — the button is
                gone.
              </P>
            </Section>

            <Section id="resolution" n="10" title="Resolution and disputes">
              <P>
                The proposer writes the resolution criteria at proposal time,
                before any points are in. Criteria must be specific enough that
                a disinterested reader could apply them without asking a
                follow-up question.
              </P>
              <P>
                If the criteria turn out to be ambiguous, the market is voided,
                not lawyered. Nobody’s evening has ever been improved by a
                semantic argument about what “rejected” was supposed to mean.
              </P>

              <Table caption="The clock">
                <Row label="Proposer resolves within" value="48h of resolution" />
                <Row label="Dispute window" value="24h thereafter" />
                <Row label="Who may dispute" value="any bettor in the market" />
                <Row label="Effect of a dispute" value="payout freezes" strong />
                <Row label="Jury" value="3 participants with no stake" />
                <Row label="Standard" value="majority, final, no appeal" />
              </Table>

              <P>
                There is no appeal above the jury, because the appeal is you not
                proposing sloppy markets next time.
              </P>
              <P>
                A voided market refunds every stake in full. A market is voided
                if the criteria are ambiguous, the event is cancelled, or the
                subject declines to cooperate.
              </P>

              <SubSection n="10.1" title="Bundle markets resolve elsewhere" />
              <P>
                A market in a bundle resolves to whatever the source market
                officially resolves to. The oracle is external, which takes the
                proposer out of adjudication entirely: there is no local
                judgment to make, so there is nothing to dispute and no jury
                path. The clock above governs markets the group writes itself.
              </P>
              <P>
                If the source market voids, or becomes unresolvable, the
                corresponding pool voids with it and refunds every stake under
                the same void rule.
              </P>
            </Section>

            <Section id="house-rules" n="11" title="House rules">
              <P>
                <strong>The subject may bet on themselves</strong>, including on
                their own failure. This is a feature and it is disclosed as one:
                the subject holds the best information and the most control over
                the outcome, and everyone else can see them bet and price it
                accordingly. A subject quietly backing their own failure is not
                a scandal. It is the most informative thing on the board.
              </P>
              <P>
                <strong>Integer points only.</strong> No fractions, no dust, no
                rounding arguments.
              </P>
              <P>
                <strong>
                  No single account may hold more than 40% of a market’s total
                  pool at close.
                </strong>{" "}
                One person with conviction and a large balance should not be
                able to turn every market into a bilateral bet against the rest
                of the group.
              </P>
              <P>
                <strong>
                  Proposing a market about someone carries the obligation to let
                  them bet in it.
                </strong>{" "}
                If you are not comfortable with them seeing it, do not propose
                it.
              </P>
            </Section>

            <Section id="settlement" n="12" title="Settlement" last>
              <P>
                Points are the unit of account. The venue keeps a running net
                ledger per person across all resolved markets — what you are up,
                what you are down, measured against the group as a whole.
              </P>
              <P>
                If the group decides to settle in cash, that happens outside the
                venue, between individuals, netted, on whatever terms they care
                to agree. The venue does not process it, hold it, escrow it, or
                have an opinion about it.
              </P>
              <P>
                The venue is a scorekeeper. It is not a counterparty, not a
                custodian, and not a bank.
              </P>
            </Section>
          </div>
        </div>
      </Shell>

      <DocsFooter />
    </main>
  );
}

function DocsHeader() {
  return (
    <>
      <Masthead up="/" current="rules" />

      <section className="border-b border-rule">
        <Shell>
          <div className="py-16 sm:py-20 lg:py-24">
            <h1 className="type-statement max-w-[16ch] text-balance">
              Market Structure
            </h1>
            <p className="measure mt-6 text-lg leading-relaxed text-muted">
              The complete specification, in the order you will need it, written
              down so nobody has to argue about it later.
            </p>
          </div>
        </Shell>
      </section>
    </>
  );
}

function Contents() {
  return (
    <nav aria-label="Contents">
      <SectionLabel>Contents</SectionLabel>
      <ol className="mt-5 space-y-2.5">
        {CONTENTS.map((entry) => (
          <li key={entry.id} className="flex gap-3 text-sm">
            <span className="w-4 shrink-0 font-mono text-muted tabular-nums">
              {entry.n}
            </span>
            <a href={`#${entry.id}`} className="text-muted hover:text-foreground">
              {entry.title}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function Section({
  id,
  n,
  title,
  children,
  last = false,
}: {
  id: string;
  n: string;
  title: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <section
      id={id}
      className={`scroll-mt-8 py-12 first:pt-0 lg:py-16 ${
        last ? "" : "border-b border-rule"
      }`}
    >
      <h2 className="type-head flex gap-4">
        <span className="font-mono tabular-nums">{n}.</span>
        <span>{title}</span>
      </h2>
      <div className="mt-6">{children}</div>
    </section>
  );
}

function SubSection({ n, title }: { n: string; title: string }) {
  return (
    <h3 className="mt-10 mb-4 flex gap-3 font-medium first:mt-0">
      <span className="font-mono text-muted tabular-nums">{n}</span>
      <span>{title}</span>
    </h3>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 leading-relaxed first:mt-0">{children}</p>;
}

function List({ children }: { children: React.ReactNode }) {
  return <ul className="mt-4 space-y-3">{children}</ul>;
}

function Item({ children }: { children: React.ReactNode }) {
  return <li className="leading-relaxed">{children}</li>;
}

function Sub({ children }: { children: React.ReactNode }) {
  return <sub className="text-[0.7em]">{children}</sub>;
}

function Mono({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-[0.9em]">{children}</span>;
}

function Formula({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-8 font-mono text-sm leading-relaxed tabular-nums sm:text-base">
      {children}
    </div>
  );
}

function Table({
  caption,
  children,
}: {
  caption: string;
  children: React.ReactNode;
}) {
  return (
    <figure className="my-8">
      <figcaption className="mb-3 text-sm text-muted">{caption}</figcaption>
      <dl className="border-t border-b border-foreground">{children}</dl>
    </figure>
  );
}

function Row({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-b border-rule py-2.5 last:border-b-0">
      <dt className="text-muted">{label}</dt>
      <dd
        className={`text-right font-mono tabular-nums ${
          strong ? "font-semibold" : ""
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function DocsFooter() {
  return (
    <footer className="border-t border-rule">
      <Shell>
        <div className="py-10">
          <p className="measure text-sm leading-relaxed text-muted">
            These rules govern every market on the board and may be amended
            between markets, never during one. A market is settled under the
            rules in force when it was proposed. Points have no cash value and
            are not redeemable, transferable, or an obligation of anyone.
          </p>
          <div className="mt-8 flex flex-wrap items-baseline justify-between gap-4">
            <Nav current="rules" />
            <span className="text-sm text-muted">
              Points only. Settle your own Venmo beef.
            </span>
          </div>
        </div>
      </Shell>
    </footer>
  );
}
