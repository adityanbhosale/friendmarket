import type { Metadata } from "next";
import Link from "next/link";
import { Masthead, Shell, SectionLabel } from "../../shell";
import { requireAdmin } from "../../lib/auth";
import { select } from "../../lib/db";
import { SITE_URL } from "../../lib/mail";
import {
  listMarkets,
  marketState,
  poolLabel,
  STATE_LABEL,
} from "../../lib/market-data";

export const metadata: Metadata = { title: "Admin — Sidebar" };

// Membership and market state are per-request truth.
export const dynamic = "force-dynamic";

type MemberRow = {
  user_id: string;
  joined_at: string;
  users: { name: string } | null;
};

export default async function AdminPage() {
  const { group, user } = await requireAdmin();

  const [members, markets] = await Promise.all([
    select<MemberRow>("group_members", {
      group_id: `eq.${group.id}`,
      select: "user_id,joined_at,users(name)",
      order: "joined_at.asc",
    }),
    listMarkets(group.id),
  ]);

  const nameOf = new Map(members.map((m) => [m.user_id, m.users?.name ?? "—"]));

  // The one thing an admin is actually for: markets that have closed and are
  // sitting there un-settled. Nothing resolves on a timer, so if nobody acts
  // the pool stays locked and the points never move.
  const awaiting = markets
    .filter(({ market }) => marketState(market) === "closed")
    .map(({ market }) => ({
      market,
      adjudicator: nameOf.get(market.adjudicator_id) ?? "someone who has left",
    }));

  const inviteUrl = `${SITE_URL}/join/${group.link_id}`;

  return (
    <main className="flex-1">
      <Masthead up="/group" />
      <Shell>
        <div className="py-16 sm:py-20">
          <SectionLabel>Admin</SectionLabel>
          <h1 className="type-head mt-3 text-balance">{group.name}</h1>
          <p className="measure mt-4 leading-relaxed text-muted">
            You opened this group, so this page is yours. Nobody else in it can
            reach this view.
          </p>

          {/* ---- the credential, which is the whole reason this page exists ---- */}
          <section className="mt-12 max-w-[720px]">
            <h2 className="text-xs tracking-wider text-muted uppercase">
              Registration
            </h2>
            <dl className="mt-4 border-t border-foreground">
              <Row label="Group ID" value={group.link_id} mono big />
              <Row label="Invite link" value={inviteUrl} mono />
              <Row label="Admin" value={user.name} />
              <Row label="Email" value={group.admin_email ?? "not on file"} />
              <Row
                label="Opened"
                value={new Date(group.created_at).toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
                last
              />
            </dl>
            <p className="measure mt-4 text-sm text-muted">
              Anyone joining needs the group ID <em>and</em> the group password.
              We never stored the password in readable form and can&apos;t send
              it to you or anyone else — if it&apos;s lost, the group is closed
              for good.
            </p>
          </section>

          {/* ---- what needs a human ---- */}
          <section className="mt-14 max-w-[720px]">
            <h2 className="text-xs tracking-wider text-muted uppercase">
              Needs attention
            </h2>
            {awaiting.length === 0 ? (
              <p className="mt-4 leading-relaxed text-muted">
                Nothing waiting. Every market that has closed has been settled.
              </p>
            ) : (
              <ul className="mt-4 border-t border-foreground">
                {awaiting.map(({ market, adjudicator }) => (
                  <li
                    key={market.id}
                    className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-rule py-4"
                  >
                    <Link
                      href={`/group/m/${market.id}`}
                      className="min-w-0 flex-1 underline decoration-rule decoration-1 underline-offset-4 hover:decoration-foreground"
                    >
                      {market.question}
                    </Link>
                    <span className="text-sm text-muted">
                      closed — {adjudicator} adjudicates
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ---- roster ---- */}
          <section className="mt-14 max-w-[720px]">
            <h2 className="text-xs tracking-wider text-muted uppercase">
              Members ({members.length})
            </h2>
            <ul className="mt-4 border-t border-foreground">
              {members.map((m, i) => (
                <li
                  key={m.user_id}
                  className="flex items-baseline justify-between gap-6 border-b border-rule py-3"
                >
                  <span>
                    {m.users?.name ?? "—"}
                    {i === 0 && (
                      <span className="ml-2 text-xs text-muted">admin</span>
                    )}
                  </span>
                  <span className="font-mono text-xs text-muted tabular-nums">
                    {new Date(m.joined_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </li>
              ))}
            </ul>
            <p className="measure mt-4 text-sm text-muted">
              Balances aren&apos;t listed here on purpose. While a market is
              still sealed, what someone has left tells you what they staked,
              and the admin doesn&apos;t get to see that either.
            </p>
          </section>

          {/* ---- board ---- */}
          <section className="mt-14 max-w-[720px]">
            <h2 className="text-xs tracking-wider text-muted uppercase">
              Markets ({markets.length})
            </h2>
            {markets.length === 0 ? (
              <p className="mt-4 leading-relaxed text-muted">
                Nothing open yet.{" "}
                <Link
                  href="/group/new"
                  className="underline decoration-1 underline-offset-4"
                >
                  Open the first one
                </Link>
                .
              </p>
            ) : (
              <ul className="mt-4 border-t border-foreground">
                {markets.map(({ market, totals }) => {
                  const state = marketState(market);
                  return (
                    <li key={market.id} className="border-b border-rule py-4">
                      <div className="flex items-baseline gap-3">
                        <span className="w-8 shrink-0 font-mono text-sm text-muted tabular-nums">
                          {String(market.display_num).padStart(2, "0")}
                        </span>
                        <div className="min-w-0 flex-1">
                          <Link
                            href={`/group/m/${market.id}`}
                            className="leading-snug underline decoration-rule decoration-1 underline-offset-4 hover:decoration-foreground"
                          >
                            {market.question}
                          </Link>
                          <p className="mt-1 text-xs text-muted">
                            {STATE_LABEL[state]} ·{" "}
                            {totals?.participants ?? 0}{" "}
                            {totals?.participants === 1 ? "bettor" : "bettors"}{" "}
                            ·{" "}
                            {/* Not a number until reveal, admin or not —
                                and now the view is what enforces that. */}
                            {poolLabel(totals)}{" "}
                            · opened by {nameOf.get(market.proposer_id) ?? "—"}
                          </p>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <p className="mt-14">
            <Link
              href="/group"
              className="text-sm text-muted underline decoration-1 underline-offset-4 hover:text-foreground"
            >
              ← Back to the group
            </Link>
          </p>
        </div>
      </Shell>
    </main>
  );
}

function Row({
  label,
  value,
  mono = false,
  big = false,
  last = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  big?: boolean;
  last?: boolean;
}) {
  return (
    <div
      className={`flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-3 ${
        last ? "" : "border-b border-rule"
      }`}
    >
      <dt className="text-xs text-muted">{label}</dt>
      <dd
        className={`${mono ? "font-mono tabular-nums" : ""} ${
          big ? "text-lg tracking-wider" : "text-sm"
        } break-all`}
      >
        {value}
      </dd>
    </div>
  );
}
