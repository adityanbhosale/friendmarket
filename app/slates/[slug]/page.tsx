import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Masthead, Nav, Shell } from "../../shell";
import { TRIPS, getSlate, getTrip, tripWindow } from "../markets";
import { SlateTable, formatRange } from "../slate-table";

export function generateStaticParams() {
  return TRIPS.map((trip) => ({ slug: trip.slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/slates/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const trip = getTrip(slug);
  if (!trip) return { title: "Slate — Sidebar" };

  return {
    title: `${trip.name} slate — Sidebar`,
    description: `Slate no. ${trip.no}: markets resolving during ${trip.destination}, staked blind.`,
  };
}

export default async function SlatePage({ params }: PageProps<"/slates/[slug]">) {
  const { slug } = await params;
  const trip = getTrip(slug);
  if (!trip) notFound();

  const slate = await getSlate(trip);
  const window = tripWindow(trip);

  return (
    <main className="flex-1">
      <Masthead up="/slates" />

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
                Sample slate shown — live Polymarket prices were unavailable.
              </p>
            )}
          </div>
        </div>
      </Shell>

      <footer className="border-t border-rule">
        <Shell>
          <div className="flex flex-wrap items-baseline justify-between gap-4 py-8">
            <Nav />
            <span className="text-sm text-muted">
              Points only. Settle your own Venmo beef.
            </span>
          </div>
        </Shell>
      </footer>
    </main>
  );
}
