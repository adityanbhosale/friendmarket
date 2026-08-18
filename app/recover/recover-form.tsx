"use client";

import Link from "next/link";
import { useActionState } from "react";
import { recoverGroup, type FormState } from "../lib/actions";

const INPUT =
  "h-11 w-full border border-rule bg-background px-4 font-mono text-base placeholder:text-muted focus:border-foreground focus:outline-none";

export function RecoverForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(
    recoverGroup,
    {},
  );

  return (
    <form action={action} className="max-w-[420px]">
      <div className="border-t border-b border-foreground">
        <div className="border-b border-rule py-4">
          <label htmlFor="link_id" className="mb-2 block text-xs text-muted">
            Group ID
          </label>
          <input
            id="link_id"
            name="link_id"
            required
            autoComplete="off"
            placeholder="K7QM-3XPD"
            className={INPUT}
          />
        </div>
        <div className="py-4">
          <label htmlFor="recovery_code" className="mb-2 block text-xs text-muted">
            Recovery code
          </label>
          <input
            id="recovery_code"
            name="recovery_code"
            required
            autoComplete="off"
            placeholder="RCV-…"
            className={INPUT}
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="mt-6 h-11 bg-foreground px-6 text-sm text-background hover:opacity-80 disabled:opacity-40"
      >
        {pending ? "…" : "Recover"}
      </button>
      <p role="status" aria-live="polite" className="mt-3 text-sm text-muted">
        {state.error ?? ""}
      </p>
      <p className="mt-5 text-sm text-muted">
        Never received a code?{" "}
        <Link href="/join" className="underline underline-offset-4 hover:text-foreground">
          Join as a new member
        </Link>
        .
      </p>
    </form>
  );
}
