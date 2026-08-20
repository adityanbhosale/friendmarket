import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Masthead, Shell, SectionLabel } from "../../shell";
import { currentMembership } from "../../lib/auth";
import { welcomePending } from "../../lib/session";
import { selectOne } from "../../lib/db";
import { normalizeGroupCode } from "../../lib/group-code";
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
  // A signed-in visitor who merely comes back here still gets bounced. The one
  // exception is the submit that just created their membership: that response
  // has to render the recovery notice before anything redirects past it.
  if ((await currentMembership()) && !(await welcomePending())) {
    redirect("/group");
  }
  const { link_id: rawLinkId } = await params;
  const link_id = normalizeGroupCode(rawLinkId);
  if (!link_id) redirect("/join");
  const group = await selectOne<{ id: string }>("groups", {
    link_id: `eq.${link_id}`,
  });
  if (!group) redirect("/join");

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
