"use client";

import { useActionState } from "react";
import { joinGroup, type FormState } from "../lib/actions";
import Link from "next/link";
import { RecoveryCodeNotice } from "../recovery-code-notice";

const INPUT =
  "h-11 w-full border border-rule bg-background px-4 text-base placeholder:text-muted focus:border-foreground focus:outline-none";

export function JoinForm({ linkId }: { linkId?: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    joinGroup,
    {},
  );

  if (state.recoveryCode) {
    return <RecoveryCodeNotice code={state.recoveryCode} groupId={state.groupId} />;
  }

  return (
    <form action={action} className="max-w-[420px]">
      <div className="border-t border-b border-foreground">
        {linkId ? (
          <input type="hidden" name="link_id" value={linkId} />
        ) : (
          <Field label="Group ID" htmlFor="link_id">
            <input
              id="link_id"
              name="link_id"
              type="text"
              required
              autoComplete="off"
              placeholder="e.g. K7QM-3XPD"
              className={INPUT}
            />
          </Field>
        )}

        <Field label="Group password" htmlFor="password">
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className={INPUT}
          />
        </Field>

        <Field label="Your name" htmlFor="name" last>
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
      </div>

      <button
        type="submit"
        disabled={pending}
        className="mt-6 h-11 bg-foreground px-6 text-sm text-background transition-opacity hover:opacity-80 disabled:opacity-40"
      >
        {pending ? "…" : "Enter"}
      </button>

      {/* aria-live so the failure is announced, not just repainted. */}
      <p role="status" aria-live="polite" className="mt-3 text-sm text-muted">
        {state.error ?? ""}
      </p>
      <p className="mt-5 text-sm text-muted">
        Returning on a new device?{" "}
        <Link href="/recover" className="underline underline-offset-4 hover:text-foreground">
          Use your recovery code
        </Link>
        .
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
