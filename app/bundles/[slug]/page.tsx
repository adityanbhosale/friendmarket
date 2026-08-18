import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BUNDLES_LIVE } from "../../lib/flags";
import { Masthead, Nav, Shell } from "../../shell";
import { ComingSoon } from "../gate";
import { TRIPS, getSlate, getTrip, tripWindow } from "../markets";
import { SlateTable, formatRange } from "../slate-table";

export function generateStaticParams() {
  // Nothing to prerender while the gate is up — every path renders the same
  // placeholder, and building them would hit the Polymarket API for markets
  // no one can see.
  if (!BUNDLES_LIVE) return [];
  return TRIPS.map((trip) => ({ slug: trip.slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/bundles/[slug]">): Promise<Metadata> {
  if (!BUNDLES_LIVE) return { title: "Market Bundles — Sidebar" };

  const { slug } = await params;
  const trip = getTrip(slug);
  if (!trip) return { title: "Market Bundle — Sidebar" };

  return {
    title: `${trip.name} bundle — Sidebar`,
    description: `Bundle no. ${trip.no}: markets resolving during ${trip.destination}, staked blind.`,
  };
}

export default async function BundlePage({
  params,
}: PageProps<"/bundles/[slug]">) {
  if (!BUNDLES_LIVE) return <ComingSoon />;

  const { slug } = await params;
  const trip = getTrip(slug);
  if (!trip) notFound();

  const slate = await getSlate(trip);
  const window = tripWindow(trip);

  return (
    <main className="flex-1">
      <Masthead up="/bundles" current="bundles" />

      <Shell>
        <div className="py-16 sm:py-20 lg:py-24">
          <h1 className="type-statement max-w-[16ch] text-balance">
            {trip.name}
          </h1>

          <p className="measure mt-5 text-lg leading-relaxed text-muted">
            {trip.destination} · {formatRange(window.start, window.end)}
          </p>
          <p className="measure mt-2 leading-relaxed text-muted italic">
            {trip.note}
          </p>

          <div className="mt-12 max-w-[820px]">
            <SlateTable slate={slate} />

            <p className="mt-6 text-sm text-muted">
              Optional side pot: one three-leg parlay per person, longest
              surviving odds takes it.
            </p>

            {slate.source === "sample" && (
              <p className="mt-2 text-sm text-muted">
                Sample bundle shown — live Polymarket prices were unavailable.
              </p>
            )}
          </div>
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
