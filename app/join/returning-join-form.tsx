"use client";

import { useActionState, useState } from "react";
import { returnToGroup, type FormState } from "../lib/actions";
import { JoinForm } from "./join-form";

const INPUT =
  "h-11 w-full border border-rule bg-background px-4 text-base placeholder:text-muted focus:border-foreground focus:outline-none";

export function ReturningJoinForm({ linkId, name }: { linkId: string; name: string }) {
  const [differentPerson, setDifferentPerson] = useState(false);
  const [state, action, pending] = useActionState<FormState, FormData>(
    returnToGroup,
    {},
  );

  if (differentPerson) return <JoinForm linkId={linkId} />;

  return (
    <div className="max-w-[420px]">
      <form action={action}>
        <input type="hidden" name="link_id" value={linkId} />
        <div className="border-t border-b border-foreground">
          <div className="border-b border-rule py-4">
            <p className="text-xs text-muted">Remembered member</p>
            <p className="mt-2 font-medium">{name}</p>
          </div>
          <Field label="Group password" htmlFor="return_password">
            <input
              id="return_password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className={INPUT}
            />
          </Field>
          <Field label="Your phone number" htmlFor="return_phone" last>
            <input
              id="return_phone"
              name="phone"
              type="tel"
              required
              autoComplete="tel"
              placeholder="(212) 555-0199"
              className={INPUT}
            />
          </Field>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="mt-6 h-11 bg-foreground px-6 text-sm text-background transition-opacity hover:opacity-80 disabled:opacity-40"
        >
          {pending ? "…" : "Return to group"}
        </button>
        <p role="status" aria-live="polite" className="mt-3 text-sm text-muted">
          {state.error ?? ""}
        </p>
      </form>
      <button
        type="button"
        onClick={() => setDifferentPerson(true)}
        className="mt-5 text-sm text-muted underline decoration-1 underline-offset-4 hover:text-foreground"
      >
        Not {name}? Enter as someone else
      </button>
    </div>
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
