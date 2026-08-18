import type { Metadata } from "next";
import { Masthead, Nav, Shell } from "../shell";

export const metadata: Metadata = {
  title: "Rules — Sidebar",
  description: "The rules enforced by Sidebar's private friend-group markets.",
};

const CONTENTS = [
  ["1", "principles", "Principles"],
  ["2", "entry", "Groups and identity"],
  ["3", "pool", "The pool"],
  ["4", "seeding", "Sealed seeding"],
  ["5", "timing", "Timing"],
  ["6", "resolution", "Resolution and voids"],
  ["7", "settlement", "Points and settlement"],
] as const;

export default function DocsPage() {
  return (
    <main className="flex-1">
      <Masthead up="/" current="rules" />
      <Shell>
        <div className="py-16 lg:grid lg:grid-cols-12 lg:gap-x-12 lg:py-24">
          <aside className="lg:sticky lg:top-10 lg:col-span-3 lg:self-start">
            <p className="text-sm text-muted">Rules enforced in the private beta</p>
            <ol className="mt-6 border-t border-foreground">
              {CONTENTS.map(([n, id, title]) => (
                <li key={id} className="border-b border-rule">
                  <a href={`#${id}`} className="flex gap-3 py-3 text-sm hover:text-muted">
                    <span className="w-5 font-mono text-xs text-muted">{n}</span>
                    <span>{title}</span>
                  </a>
                </li>
              ))}
            </ol>
          </aside>

          <article className="measure mt-16 lg:col-span-7 lg:col-start-5 lg:mt-0">
            <header className="border-b border-foreground pb-12">
              <h1 className="type-statement max-w-[16ch] text-balance">The rules of the book.</h1>
              <p className="mt-6 leading-relaxed text-muted">
                This page describes what the beta actually enforces. If the interface
                and this page disagree, stop and treat it as a bug.
              </p>
            </header>

            <Section id="principles" n="1" title="Principles">
              <P>
                Sidebar is invite-only and denominated in points. It does not hold,
                process, or redeem money. Every market belongs to one private group.
              </P>
              <P>
                There is no market maker and no order book. The displayed probability
                is the ratio of one side&apos;s points to the combined pool. Nobody is
                promising to trade at that number.
              </P>
              <P>
                Markets are binary. Their labels are currently Yes and No, and the
                proposer must write the settlement criteria before anyone stakes.
              </P>
            </Section>

            <Section id="entry" n="2" title="Groups and identity">
              <P>
                Anyone with a group ID and its shared password may join. Each new
                member receives 1,000 points exactly once for that identity.
              </P>
              <P>
                The browser keeps a signed session cookie. A recovery code is the
                bearer credential for restoring that same identity, balance, and
                stakes on another device. Generating a replacement invalidates the
                old code immediately.
              </P>
              <P>
                Keep the shared password and personal recovery codes out of public
                channels. Sidebar cannot recover a forgotten group password.
              </P>
            </Section>

            <Section id="pool" n="3" title="The pool">
              <P>
                A stake adds a positive whole number of points to one side. Stakes
                cannot be cancelled, reduced, transferred, or cashed out. A member
                may add more stakes until the market closes, provided their balance
                can cover them.
              </P>
              <P>
                At resolution, the combined pool is distributed across winning
                stakes in proportion to their size.
              </P>
              <Formula>payout = stake × ( total pool ÷ winning pool )</Formula>
              <P>
                Payouts are floored to whole points. A small amount of rounding dust
                may therefore remain unallocated.
              </P>
            </Section>

            <Section id="seeding" n="4" title="Sealed seeding">
              <P>
                Seeding begins when the market opens. Stakes are accepted, but side
                totals, total volume, per-side stake counts, and implied probabilities
                remain hidden from everyone—including the proposer.
              </P>
              <P>
                The only activity number visible during seeding is the total number
                of distinct participants. When the reveal time arrives, pools and
                implied probabilities become visible and staking continues until close.
              </P>
              <Table
                rows={[
                  ["Seeding", "stakes accepted; pools sealed"],
                  ["Open", "pools visible; stakes accepted"],
                  ["Closed", "no stakes; waiting for resolution time"],
                  ["Resolved / Void", "ledger entries final"],
                ]}
              />
            </Section>

            <Section id="timing" n="5" title="Timing">
              <P>
                The proposer fixes three distinct timestamps when opening a market.
                They cannot be edited through the beta interface.
              </P>
              <Formula>reveal &lt; close &lt; resolution</Formula>
              <Table
                rows={[
                  ["Reveal", "sealed pools become visible"],
                  ["Close", "new stakes are rejected"],
                  ["Resolution", "the proposer may settle from this time onward"],
                ]}
              />
              <P>
                Close should precede the earliest moment the outcome could become
                knowable. Resolution should be the earliest moment the written
                criteria can actually be applied.
              </P>
            </Section>

            <Section id="resolution" n="6" title="Resolution and voids">
              <P>
                Only the proposer may resolve a market, and not before its resolution
                timestamp. Settlement is permanent.
              </P>
              <P>
                Declaring a side distributes the pool to that side. The market voids
                and refunds every stake if nobody staked, nobody backed the declared
                side, or the proposer deliberately chooses Void because the criteria
                cannot produce a trustworthy outcome.
              </P>
              <P>
                This beta does not yet provide disputes, juries, appeals, or an
                administrator settlement screen. Groups should void ambiguous markets.
              </P>
            </Section>

            <Section id="settlement" n="7" title="Points and settlement" last>
              <P>
                Balances are the sum of an append-only ledger: allocations, stakes,
                payouts, and refunds. The application never mutates one opaque balance,
                so every movement can be reconstructed.
              </P>
              <P>
                Points are only a score. If friends decide to settle something outside
                Sidebar, that agreement is entirely outside the product.
              </P>
            </Section>
          </article>
        </div>
      </Shell>

      <footer className="border-t border-rule">
        <Shell>
          <div className="flex flex-wrap items-baseline justify-between gap-4 py-8">
            <Nav current="rules" />
            <span className="text-sm text-muted">Points only.</span>
          </div>
        </Shell>
      </footer>
    </main>
  );
}

function Section({
  id,
  n,
  title,
  last = false,
  children,
}: {
  id: string;
  n: string;
  title: string;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className={`scroll-mt-10 py-12 ${last ? "" : "border-b border-rule"}`}>
      <h2 className="type-head flex gap-4">
        <span className="font-mono text-sm text-muted">{n}</span>
        <span>{title}</span>
      </h2>
      <div className="mt-7">{children}</div>
    </section>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 leading-relaxed first:mt-0">{children}</p>;
}

function Formula({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-7 border-t border-b border-foreground py-4 text-center font-mono text-sm">
      {children}
    </div>
  );
}

function Table({ rows }: { rows: Array<[string, string]> }) {
  return (
    <dl className="my-7 border-t border-b border-foreground">
      {rows.map(([label, value], index) => (
        <div
          key={label}
          className={`grid gap-1 py-3 sm:grid-cols-[10rem_1fr] sm:gap-5 ${
            index === rows.length - 1 ? "" : "border-b border-rule"
          }`}
        >
          <dt className="text-sm text-muted">{label}</dt>
          <dd className="text-sm">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
