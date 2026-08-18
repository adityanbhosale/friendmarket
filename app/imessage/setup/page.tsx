import type { Metadata } from "next";
import { currentMembership, type Group } from "../../lib/auth";
import { selectOne } from "../../lib/db";
import { getLiveImessageSetup } from "../../lib/imessage-setup";
import { JoinForm } from "../../join/join-form";
import { Masthead, SectionLabel, Shell } from "../../shell";
import { CreateGroupForm } from "../../start/create-form";
import { LinkCurrentGroupForm } from "./link-form";

export const metadata: Metadata = {
  title: "Connect iMessage — Sidebar",
  referrer: "no-referrer",
};
export const dynamic = "force-dynamic";

export default async function ImessageSetupPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const rawToken = (await searchParams).token;
  const live = await getLiveImessageSetup(
    Array.isArray(rawToken) ? rawToken[0] : rawToken,
  );
  const membership = await currentMembership();

  if (!live) return <SetupShell title="That setup link is invalid, expired, or already used." />;

  const targetGroup = live.setup.group_id
    ? await selectOne<Group>("groups", { id: `eq.${live.setup.group_id}` })
    : null;

  let content: React.ReactNode;
  if (targetGroup && membership?.group.id === targetGroup.id) {
    content = (
      <LinkCurrentGroupForm
        token={live.token}
        groupName={membership.group.name}
      />
    );
  } else if (targetGroup) {
    content = <JoinForm linkId={targetGroup.link_id} imessageToken={live.token} />;
  } else if (membership) {
    content = (
      <LinkCurrentGroupForm
        token={live.token}
        groupName={membership.group.name}
      />
    );
  } else {
    content = (
      <div className="grid gap-12">
        <section>
          <h2 className="mb-5 text-sm font-medium">Open a new Sidebar group</h2>
          <CreateGroupForm imessageToken={live.token} />
        </section>
        <section className="border-t border-rule pt-10">
          <h2 className="mb-2 text-sm font-medium">Connect an existing group</h2>
          <p className="measure mb-5 text-sm leading-relaxed text-muted">
            Enter its group ID and shared password. This creates your member
            identity and connects this iMessage conversation in one step.
          </p>
          <JoinForm imessageToken={live.token} />
        </section>
      </div>
    );
  }

  return (
    <SetupShell
      title={targetGroup ? `Join ${targetGroup.name} from iMessage.` : "Create or connect a Sidebar group."}
    >
      {content}
    </SetupShell>
  );
}

function SetupShell({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <main className="flex-1">
      <Masthead up="/" />
      <Shell>
        <div className="grid gap-x-12 gap-y-10 py-20 sm:py-24 lg:grid-cols-12 lg:py-32">
          <div className="lg:col-span-4">
            <SectionLabel>iMessage setup</SectionLabel>
            <h1 className="type-head mt-3 text-balance">{title}</h1>
            <p className="measure mt-5 leading-relaxed text-muted">
              iMessage is an optional interface. Sidebar groups work without it,
              and connecting one does not change the native chat membership.
            </p>
          </div>
          <div className="lg:col-span-6 lg:col-start-6">{children}</div>
        </div>
      </Shell>
    </main>
  );
}
