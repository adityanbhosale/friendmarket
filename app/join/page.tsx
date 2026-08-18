import type { Metadata } from "next";
import { Masthead, Shell, SectionLabel } from "../shell";
import { JoinForm } from "./join-form";

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
              Groups are private. You need the link and the password.
            </h1>
            <p className="measure mt-5 leading-relaxed text-muted">
              Whoever opened the group has both. Ask them, not us — we can&apos;t
              recover a group password.
            </p>
          </div>

          <div className="lg:col-span-6 lg:col-start-6">
            <JoinForm />
          </div>
        </div>
      </Shell>
    </main>
  );
}
