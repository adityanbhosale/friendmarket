import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Masthead, Shell, SectionLabel } from "../shell";
import { currentMembership } from "../lib/auth";
import { welcomePending } from "../lib/session";
import { GroupCodeForm } from "./group-code-form";

export const metadata: Metadata = { title: "Join a group — Sidebar" };

export default async function JoinPage() {
  // A signed-in visitor who merely comes back here still gets bounced. The one
  // exception is the submit that just created their membership: that response
  // has to render the recovery notice before anything redirects past it.
  if ((await currentMembership()) && !(await welcomePending())) {
    redirect("/group");
  }

  return (
    <main className="flex-1">
      <Masthead up="/" />
      <Shell>
        <div className="grid gap-x-12 gap-y-12 py-16 sm:py-20 lg:grid-cols-12 lg:py-24">
          <div className="lg:col-span-5">
            <SectionLabel>Start here</SectionLabel>
            <h1 className="type-head mt-3 text-balance">
              Create the group here. Bring Sidebar into iMessage after.
            </h1>
            <p className="measure mt-5 leading-relaxed text-muted">
              Set up your Sidebar group on the web, then connect it to the shared
              iMessage conversation with one message. The web group still works
              on its own; iMessage is an optional interface.
            </p>

            <Link
              href="/start"
              className="mt-7 inline-flex h-11 items-center bg-foreground px-6 text-sm text-background transition-opacity hover:opacity-80"
            >
              Create a group →
            </Link>

            <div className="mt-12 border-t border-foreground pt-5">
              <h2 className="text-sm font-medium">Got a code from a friend?</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Join their existing Sidebar group before connecting Messages.
              </p>
              <div className="mt-5">
                <GroupCodeForm />
              </div>
            </div>
          </div>

          <div className="lg:col-span-6 lg:col-start-7">
            <Image
              src="/sidebar-imessage-onboarding.svg"
              alt="iMessage conversation showing Sidebar onboarding"
              width={1200}
              height={980}
              priority
              className="h-auto w-full border border-rule"
            />
            <ol className="mt-5 grid gap-2 text-xs leading-relaxed text-muted sm:grid-cols-3 sm:gap-5">
              <li><span className="font-mono text-foreground">01</span> Create the web group.</li>
              <li><span className="font-mono text-foreground">02</span> Message Sidebar directly.</li>
              <li><span className="font-mono text-foreground">03</span> Add it to the group chat.</li>
            </ol>
          </div>
        </div>
      </Shell>
    </main>
  );
}
