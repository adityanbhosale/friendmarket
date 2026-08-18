import type { Metadata } from "next";
import { Masthead, Shell, SectionLabel } from "../shell";
import { RecoverForm } from "./recover-form";

export const metadata: Metadata = { title: "Recover your place — Sidebar" };

export default function RecoverPage() {
  return (
    <main className="flex-1">
      <Masthead up="/join" />
      <Shell>
        <div className="grid gap-x-12 gap-y-10 py-20 sm:py-24 lg:grid-cols-12 lg:py-32">
          <div className="lg:col-span-4">
            <SectionLabel>Recovery</SectionLabel>
            <h1 className="type-head mt-3 text-balance">
              Pick up the same points and stakes on this device.
            </h1>
            <p className="measure mt-5 leading-relaxed text-muted">
              Use the group ID and the recovery code you saved when you joined.
            </p>
          </div>
          <div className="lg:col-span-6 lg:col-start-6">
            <RecoverForm />
          </div>
        </div>
      </Shell>
    </main>
  );
}
