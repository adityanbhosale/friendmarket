import type { Metadata } from "next";
import { Masthead, Shell, SectionLabel } from "../shell";
import { CreateGroupForm } from "./create-form";

export const metadata: Metadata = { title: "Open a group — Sidebar" };

export default function StartPage() {
  return (
    <main className="flex-1">
      <Masthead up="/" />
      <Shell>
        <div className="grid gap-x-12 gap-y-10 py-20 sm:py-24 lg:grid-cols-12 lg:py-32">
          <div className="lg:col-span-4">
            <SectionLabel>Open a group</SectionLabel>
            <h1 className="type-head mt-3 text-balance">
              You&apos;ll get an ID to paste into the chat.
            </h1>
            <p className="measure mt-5 leading-relaxed text-muted">
              Anyone with the ID and the password can join and gets 1,000 points
              to stake. Points only — nothing here is redeemable for anything.
            </p>
          </div>

          <div className="lg:col-span-6 lg:col-start-6">
            <CreateGroupForm />
          </div>
        </div>
      </Shell>
    </main>
  );
}
