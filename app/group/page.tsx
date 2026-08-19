import type { Metadata } from "next";
import Link from "next/link";
import { Masthead, Shell, SectionLabel } from "../shell";
import { isAdmin, requireMembership } from "../lib/auth";
import { count } from "../lib/db";
import { getBalance } from "../lib/points";
import {
  listMarkets,
  marketState,
  poolLabel,
  STATE_LABEL,
} from "../lib/market-data";
import { signOut } from "../lib/actions";
import { RecoveryCodeForm } from "./recovery-code-form";
import { PhoneIdentityForm } from "./phone-identity-form";

export const metadata: Metadata = { title: "Your group — Sidebar" };

// Balances and pools are per-request truth. Nothing here may be cached.
export const dynamic = "force-dynamic";

export default async function GroupPage() {
  const { user, group, membership } = await requireMembership();
  const admin = isAdmin(group, user);

  const [balance, members, markets] = await Promise.all([
    getBalance(group.id, user.id),
    count("group_members", { group_id: `eq.${group.id}` }),
    listMarkets(group.id, user.id),
  ]);
  const joinedMarkets = markets.filter((market) => market.joined);
  const availableMarkets = markets.filter((market) => !market.joined);

  return (
    <main className="flex-1">
      <Masthead up="/" />
      <Shell>
        <div className="grid gap-x-12 gap-y-12 py-16 sm:py-20 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <SectionLabel>Group</SectionLabel>
            <h1 className="type-head mt-3 text-balance">{group.name}</h1>

            <dl className="mt-8 border-t border-foreground">
              <Row label="Group ID" value={group.link_id} mono />
              <Row label="Members" value={String(members)} mono />
              <Row
                label="Signed in as"
                value={admin ? `${user.name} · admin` : user.name}
              />
              <Row
                label="Member code"
                value={membership.phone_attached_at ? membership.identity_code : "Pending"}
                mono
              />
              <Row
                label="Your points"
                value={balance.toLocaleString("en-US")}
                mono
                last
              />
            </dl>

            <p className="measure mt-5 text-xs text-muted">
              Anyone with the group ID and the password can join. Send them
              separately if you care about who gets in.
            </p>

            {!membership.phone_attached_at && <PhoneIdentityForm />}

            {admin && (
              <p className="mt-5">
                <Link
                  href="/group/admin"
                  className="text-sm underline decoration-1 underline-offset-4 hover:text-muted"
                >
                  Admin view →
                </Link>
              </p>
            )}

            <RecoveryCodeForm hasCode={Boolean(user.recovery_code_hash)} />

            <form action={signOut}>
              <button
                type="submit"
                className="mt-6 text-sm text-muted underline decoration-1 underline-offset-4 hover:text-foreground"
              >
                Sign out
              </button>
            </form>
          </div>

          <div className="lg:col-span-7 lg:col-start-6">
            <div className="flex items-baseline justify-between gap-4">
              <SectionLabel>Markets</SectionLabel>
              {membership.phone_attached_at && (
                <Link
                  href="/group/new"
                  className="text-sm text-muted hover:text-foreground"
                >
                  Open a market →
                </Link>
              )}
            </div>

            {!membership.phone_attached_at ? (
              <p className="measure mt-6 leading-relaxed text-muted">
                Attach your phone identity to join markets, stake points, or
                open a new market. Your existing group access stays intact.
              </p>
            ) : markets.length === 0 ? (
              <p className="measure mt-6 leading-relaxed text-muted">
                Nothing open yet. Someone has to go first.
              </p>
            ) : (
              <div className="mt-6 grid gap-10">
                <MarketSection title="Joined" rows={joinedMarkets} empty="You haven't joined a market yet." />
                <MarketSection
                  title="Not joined"
                  rows={availableMarkets}
                  empty="You've joined every market in this group."
                />
              </div>
            )}
          </div>
        </div>
      </Shell>
    </main>
  );
}

function MarketSection({
  title,
  rows,
  empty,
}: {
  title: string;
  rows: Awaited<ReturnType<typeof listMarkets>>;
  empty: string;
}) {
  return (
    <section>
      <h2 className="text-xs tracking-wider text-muted uppercase">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted">{empty}</p>
      ) : (
        <div className="mt-3 border-t border-b border-foreground">
          {rows.map(({ market, totals }) => {
            const state = marketState(market);
            return (
              <Link
                key={market.id}
                href={`/group/m/${market.id}`}
                className="block border-b border-rule py-4 last:border-b-0 hover:bg-[#fafafa]"
              >
                <div className="flex items-baseline justify-between gap-4 text-xs text-muted">
                  <span className="font-mono tabular-nums">
                    {String(market.display_num).padStart(4, "0")}
                  </span>
                  <span>{STATE_LABEL[state]}</span>
                </div>
                <p className="mt-2 leading-snug font-medium text-balance">
                  {market.question}
                </p>
                <div className="mt-2 flex flex-wrap gap-x-5 text-xs text-muted">
                  {market.subject_name && <span>about {market.subject_name}</span>}
                  <span>
                    {totals?.participants ?? 0}{" "}
                    {totals?.participants === 1 ? "bettor" : "bettors"}
                  </span>
                  <span className="font-mono tabular-nums">{poolLabel(totals)}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}

function Row({
  label,
  value,
  mono = false,
  last = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  last?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-4 py-2.5 ${
        last ? "" : "border-b border-rule"
      }`}
    >
      <dt className="text-sm text-muted">{label}</dt>
      <dd className={mono ? "font-mono tabular-nums" : ""}>{value}</dd>
    </div>
  );
}
