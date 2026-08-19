"use client";

import { useActionState } from "react";
import { goToGroupJoin, type FormState } from "../lib/actions";

export function GroupCodeForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(
    goToGroupJoin,
    {},
  );

  return (
    <form action={action} className="max-w-[420px]">
      <div className="border-t border-b border-foreground py-4">
        <label htmlFor="group_code" className="mb-2 block text-xs text-muted">
          Group code
        </label>
        <input
          id="group_code"
          name="group_code"
          type="text"
          required
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={40}
          placeholder="e.g. K7QM-3XPD"
          className="h-11 w-full border border-rule bg-background px-4 text-base uppercase placeholder:text-muted focus:border-foreground focus:outline-none"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="mt-6 h-11 bg-foreground px-6 text-sm text-background transition-opacity hover:opacity-80"
      >
        {pending ? "…" : "Continue →"}
      </button>
      <p role="status" aria-live="polite" className="mt-3 text-sm text-muted">
        {state.error ?? ""}
      </p>
    </form>
  );
}
