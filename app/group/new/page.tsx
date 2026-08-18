import type { Metadata } from "next";
import { Masthead, Shell, SectionLabel } from "../../shell";
import { requireMembership } from "../../lib/auth";
import { MarketForm } from "./market-form";

export const metadata: Metadata = { title: "Open a market — Sidebar" };
export const dynamic = "force-dynamic";

export default async function NewMarketPage() {
  await requireMembership();

  return (
    <main className="flex-1">
      <Masthead up="/group" />
      <Shell>
        <div className="grid gap-x-12 gap-y-10 py-16 sm:py-20 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <SectionLabel>New market</SectionLabel>
            <h1 className="type-head mt-3 text-balance">
              Anything the group chat already argued about.
            </h1>
            <p className="measure mt-5 leading-relaxed text-muted">
              Seeding runs blind: people stake without seeing the pool or each
              other. Odds only exist once seeding ends.
            </p>
          </div>

          <div className="lg:col-span-7 lg:col-start-6">
            <MarketForm />
          </div>
        </div>
      </Shell>
    </main>
  );
}
