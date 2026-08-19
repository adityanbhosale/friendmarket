import type { Metadata } from "next";
import { Masthead, Shell, SectionLabel } from "../shell";
import { GroupCodeForm } from "./group-code-form";

export const metadata: Metadata = { title: "Join a group — Sidebar" };

export default function JoinPage() {
  return (
    <main className="flex-1">
      <Masthead up="/" />
      <Shell>
        <div className="grid gap-x-12 gap-y-10 py-20 sm:py-24 lg:grid-cols-12 lg:py-32">
          <div className="lg:col-span-4">
            <SectionLabel>Entry</SectionLabel>
            <h1 className="type-head mt-3 text-balance">
              Start with the code your group gave you.
            </h1>
            <p className="measure mt-5 leading-relaxed text-muted">
              Next, enter your name, phone number, and the shared password.
              Sidebar uses returning phone identities to reopen the same member
              UUID instead of making a duplicate account.
            </p>
          </div>

          <div className="lg:col-span-6 lg:col-start-6">
            <GroupCodeForm />
          </div>
        </div>
      </Shell>
    </main>
  );
}
