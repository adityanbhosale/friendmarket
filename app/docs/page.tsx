import type { Metadata } from "next";
import Link from "next/link";
import { Shell, SectionLabel } from "../shell";

export const metadata: Metadata = {
  title: "Rules — friendmarket",
  description:
    "The complete market structure specification: parimutuel pools, pricing, resolution, disputes, and settlement.",
};

const CONTENTS = [
  { n: "1", id: "principles", title: "Principles" },
  { n: "2", id: "pool", title: "The pool" },
  { n: "3", id: "pricing", title: "Pricing" },
  { n: "4", id: "sealed-seeding", title: "Sealed seeding" },
  { n: "5", id: "no-maker", title: "Why there is no market maker" },
  { n: "6", id: "matched-book", title: "Considered and rejected: matched book" },
  { n: "7", id: "timing", title: "Timing" },
  { n: "8", id: "resolution", title: "Resolution and disputes" },
  { n: "9", id: "house-rules", title: "House rules" },
  { n: "10", id: "settlement", title: "Settlement" },
];

export default function Docs() {
  return (
    <main className="flex-1">
      <Masthead />

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

            <Section id="no-maker" n="5" title="Why there is no market maker">
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

              <SubSection n="5.1" title="Seeding mechanics, for the record" />
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
              n="6"
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

            <Section id="timing" n="7" title="Timing">
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

            <Section id="resolution" n="8" title="Resolution and disputes">
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
            </Section>

            <Section id="house-rules" n="9" title="House rules">
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

            <Section id="settlement" n="10" title="Settlement" last>
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

function Masthead() {
  return (
    <>
      <div className="border-b border-rule">
        <Shell>
          <div className="flex items-baseline justify-between gap-6 py-5">
            <Link
              href="/"
              className="type-wordmark font-medium hover:text-muted"
            >
              ← Friendmarket
            </Link>
            <span className="text-sm text-muted">Rules</span>
          </div>
        </Shell>
      </div>

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
            <Link href="/" className="text-sm text-muted hover:text-foreground">
              ← Friendmarket
            </Link>
            <span className="text-sm text-muted">
              Points only. Settle your own Venmo beef.
            </span>
          </div>
        </div>
      </Shell>
    </footer>
  );
}
