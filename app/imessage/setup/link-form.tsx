"use client";

import Link from "next/link";
import { useActionState } from "react";
import { linkCurrentGroupToImessage, type FormState } from "../../lib/actions";

export function LinkCurrentGroupForm({
  token,
  groupName,
}: {
  token: string;
  groupName: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    linkCurrentGroupToImessage,
    {},
  );

  if (state.imessageLinked) {
    return (
      <div className="border-t border-b border-foreground py-6">
        <p className="font-medium">iMessage connected.</p>
        <p className="mt-2 text-sm text-muted">
          Return to the group chat and send “sidebar help”.
        </p>
        <Link href="/group" className="mt-5 inline-block text-sm underline underline-offset-4">
          Continue to {groupName} →
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="max-w-[420px] border-t border-b border-foreground py-6">
      <input type="hidden" name="imessage_token" value={token} />
      <p className="leading-relaxed">
        Connect this iMessage conversation to <strong>{groupName}</strong>. The
        Sidebar group will continue to work normally on the web.
      </p>
      <button
        type="submit"
        disabled={pending}
        className="mt-5 h-11 bg-foreground px-6 text-sm text-background disabled:opacity-40"
      >
        {pending ? "…" : "Connect this group"}
      </button>
      <p role="status" aria-live="polite" className="mt-3 text-sm text-muted">
        {state.error ?? ""}
      </p>
    </form>
  );
}
