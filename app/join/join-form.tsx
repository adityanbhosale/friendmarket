"use client";

import { useActionState } from "react";
import { joinGroup, type FormState } from "../lib/actions";
import Link from "next/link";
import { RecoveryCodeNotice } from "../recovery-code-notice";

const INPUT =
  "h-11 w-full border border-rule bg-background px-4 text-base placeholder:text-muted focus:border-foreground focus:outline-none";

export function JoinForm({
  linkId,
  imessageToken,
}: {
  linkId?: string;
  imessageToken?: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    joinGroup,
    {},
  );

  if (state.recoveryCode) {
    return <RecoveryCodeNotice
        code={state.recoveryCode}
        groupId={state.groupId}
        memberId={state.memberId}
      />;
  }

  return (
    <form action={action} className="max-w-[420px]">
      {imessageToken && (
        <input type="hidden" name="imessage_token" value={imessageToken} />
      )}
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

        <Field label="Your phone number" htmlFor="phone">
          <input
            id="phone"
            name="phone"
            type="tel"
            required
            autoComplete="tel"
            placeholder="(212) 555-0199"
            className={INPUT}
          />
          <p className="mt-2 text-xs text-muted">
            New members get a stable member code. Returning members use the
            same number to reopen their existing UUID, points, and markets.
          </p>
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

        <Field label="Your email (optional)" htmlFor="email" last>
          <input
            id="email"
            name="email"
            type="email"
            maxLength={254}
            autoComplete="email"
            placeholder="you@example.com"
            className={INPUT}
          />
          <p className="mt-2 text-xs text-muted">
            If provided, Sidebar emails your group code. On first entry it also
            includes your member ID and one-time recovery code.
          </p>
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
        No longer have access to that phone number?{" "}
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
