"use client";

import { useActionState } from "react";
import { createGroup, type FormState } from "../lib/actions";
import { RecoveryCodeNotice } from "../recovery-code-notice";

const INPUT =
  "h-11 w-full border border-rule bg-background px-4 text-base placeholder:text-muted focus:border-foreground focus:outline-none";

export function CreateGroupForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(
    createGroup,
    {},
  );

  if (state.recoveryCode) {
    return <RecoveryCodeNotice code={state.recoveryCode} groupId={state.groupId} />;
  }

  return (
    <form action={action} className="max-w-[420px]">
      <div className="border-t border-b border-foreground">
        <Field label="Group name" htmlFor="group_name">
          <input
            id="group_name"
            name="group_name"
            type="text"
            required
            maxLength={60}
            placeholder="Moab 2026"
            className={INPUT}
          />
        </Field>

        <Field label="Your name" htmlFor="name">
          <input
            id="name"
            name="name"
            type="text"
            required
            maxLength={40}
            autoComplete="name"
            placeholder="What the group calls you"
            className={INPUT}
          />
        </Field>

        <Field label="Group password" htmlFor="password" last>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className={INPUT}
          />
          <p className="mt-2 text-xs text-muted">
            Eight characters or more. Everyone in the group uses this one
            password — we can&apos;t recover it for you.
          </p>
        </Field>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="mt-6 h-11 bg-foreground px-6 text-sm text-background transition-opacity hover:opacity-80 disabled:opacity-40"
      >
        {pending ? "…" : "Open the group"}
      </button>

      <p role="status" aria-live="polite" className="mt-3 text-sm text-muted">
        {state.error ?? ""}
      </p>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  last = false,
  children,
}: {
  label: string;
  htmlFor: string;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={last ? "py-4" : "border-b border-rule py-4"}>
      <label htmlFor={htmlFor} className="mb-2 block text-xs text-muted">
        {label}
      </label>
      {children}
    </div>
  );
}
