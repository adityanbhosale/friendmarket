import type { Metadata } from "next";
import { currentMembership, type Group } from "../../lib/auth";
import { selectOne } from "../../lib/db";
import {
  getCompletedImessageSetup,
  getLiveImessageSetup,
} from "../../lib/imessage-setup";
import { welcomePending } from "../../lib/session";
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
  const token = Array.isArray(rawToken) ? rawToken[0] : rawToken;
  const membership = await currentMembership();
  const live = await getLiveImessageSetup(token);
  const completed =
    !live && membership && (await welcomePending())
      ? await getCompletedImessageSetup(token, {
          groupId: membership.group.id,
          userId: membership.user.id,
        })
      : null;
  const setup = live ?? completed;

  if (!setup) {
    return <SetupShell title="That setup link is invalid, expired, or already used." />;
  }

  const targetGroup = setup.setup.group_id
    ? await selectOne<Group>("groups", { id: `eq.${setup.setup.group_id}` })
    : null;

  let content: React.ReactNode;
  // A completed setup has already created the session and consumed the token.
  // Keep the same form subtree for this response so useActionState can render
  // the recovery notice instead of being replaced by the invalid-link shell.
  if (completed && targetGroup) {
    content = <JoinForm linkId={targetGroup.link_id} imessageToken={setup.token} />;
  } else if (completed) {
    content = <SetupChoices token={setup.token} />;
  } else if (targetGroup && membership?.group.id === targetGroup.id) {
    content = (
      <LinkCurrentGroupForm
        token={setup.token}
        groupName={membership.group.name}
      />
    );
  } else if (targetGroup) {
    content = <JoinForm linkId={targetGroup.link_id} imessageToken={setup.token} />;
  } else if (membership) {
    content = (
      <LinkCurrentGroupForm
        token={setup.token}
        groupName={membership.group.name}
      />
    );
  } else {
    content = <SetupChoices token={setup.token} />;
  }

  return (
    <SetupShell
      title={targetGroup ? `Join ${targetGroup.name} from iMessage.` : "Create or connect a Sidebar group."}
    >
      {content}
    </SetupShell>
  );
}

function SetupChoices({ token }: { token: string }) {
  return (
    <div className="grid gap-12">
      <section>
        <h2 className="mb-5 text-sm font-medium">Open a new Sidebar group</h2>
        <CreateGroupForm imessageToken={token} />
      </section>
      <section className="border-t border-rule pt-10">
        <h2 className="mb-2 text-sm font-medium">Connect an existing group</h2>
        <p className="measure mb-5 text-sm leading-relaxed text-muted">
          Enter its group ID and shared password. This creates your member
          identity and connects this iMessage conversation in one step.
        </p>
        <JoinForm imessageToken={token} />
      </section>
    </div>
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
