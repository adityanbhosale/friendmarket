"use client";

import { useActionState } from "react";
import { attachPhoneIdentity, type FormState } from "../lib/actions";

export function PhoneIdentityForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(
    attachPhoneIdentity,
    {},
  );

  return (
    <form action={action} className="mt-8 max-w-[420px] border-t border-b border-foreground py-5">
      <label htmlFor="phone" className="block text-xs text-muted">
        Your phone number
      </label>
      <input
        id="phone"
        name="phone"
        type="tel"
        required
        autoComplete="tel"
        placeholder="(212) 555-0199"
        className="mt-2 h-11 w-full border border-rule bg-background px-4 text-base placeholder:text-muted focus:border-foreground focus:outline-none"
      />
      <p className="mt-2 text-xs leading-relaxed text-muted">
        This creates your stable member code. Sidebar stores a keyed identity,
        not the number itself, and never shows the number to the group.
      </p>
      <button
        type="submit"
        disabled={pending}
        className="mt-5 h-11 bg-foreground px-6 text-sm text-background transition-opacity hover:opacity-80 disabled:opacity-40"
      >
        {pending ? "…" : "Attach phone identity"}
      </button>
      <p role="status" aria-live="polite" className="mt-3 text-sm text-muted">
        {state.error ?? ""}
      </p>
    </form>
  );
}
