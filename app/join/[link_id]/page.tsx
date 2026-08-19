import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Masthead, Shell, SectionLabel } from "../../shell";
import { currentMembership } from "../../lib/auth";
import { JoinForm } from "../join-form";

export const metadata: Metadata = { title: "Join a group — Sidebar" };

/**
 * The shareable form of the join page: /join/<link_id>.
 *
 * Deliberately does not look the group up before rendering. Rendering "Moab
 * 2026" here would turn the page into an oracle for which links are real, and
 * the link is half the credential.
 */
export default async function JoinByLinkPage({
  params,
}: PageProps<"/join/[link_id]">) {
  if (await currentMembership()) redirect("/group");
  const { link_id } = await params;

  return (
    <main className="flex-1">
      <Masthead up="/" />
      <Shell>
        <div className="grid gap-x-12 gap-y-10 py-20 sm:py-24 lg:grid-cols-12 lg:py-32">
          <div className="lg:col-span-4">
            <SectionLabel>Entry</SectionLabel>
            <h1 className="type-head mt-3 text-balance">
              Now identify yourself inside the group.
            </h1>
            <p className="measure mt-5 leading-relaxed text-muted">
              Your phone opens the same member UUID every time. The shared
              password proves you were meant to have access.
            </p>
          </div>

          <div className="lg:col-span-6 lg:col-start-6">
            <JoinForm linkId={link_id} />
          </div>
        </div>
      </Shell>
    </main>
  );
}
