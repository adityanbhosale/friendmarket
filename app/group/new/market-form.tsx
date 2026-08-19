"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { openMarket, type FormState } from "../../lib/actions";

const INPUT =
  "h-11 w-full border border-rule bg-background px-4 text-base placeholder:text-muted focus:border-foreground focus:outline-none";

/** `YYYY-MM-DDTHH:mm` in the browser's own zone, which is what the input wants. */
function localInputValue(msFromNow: number): string {
  const d = new Date(Date.now() + msFromNow);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export function MarketForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(
    openMarket,
    {},
  );

  const tz = useRef<HTMLInputElement>(null);
  const reveal = useRef<HTMLInputElement>(null);
  const close = useRef<HTMLInputElement>(null);
  const resolve = useRef<HTMLInputElement>(null);
  const [hasSubject, setHasSubject] = useState(false);

  // Filled after mount rather than during render: the server has no idea what
  // zone the browser is in, and guessing would cause a hydration mismatch.
  useEffect(() => {
    if (tz.current) tz.current.value = String(new Date().getTimezoneOffset());
    if (reveal.current && !reveal.current.value)
      reveal.current.value = localInputValue(DAY);
    if (close.current && !close.current.value)
      close.current.value = localInputValue(7 * DAY);
    if (resolve.current && !resolve.current.value)
      resolve.current.value = localInputValue(8 * DAY);
  }, []);

  return (
    <form action={action} className="max-w-[520px]">
      <input type="hidden" name="tz_offset" ref={tz} />

      <div className="border-t border-b border-foreground">
        <Field label="Question" htmlFor="question">
          <input
            id="question"
            name="question"
            type="text"
            required
            maxLength={200}
            placeholder="Will [redacted] get to the office before 10am tomorrow?"
            className={INPUT}
          />
          <p className="mt-2 text-xs text-muted">
            It needs a yes-or-no answer and a date.
          </p>
        </Field>

        <Field label="How it settles" htmlFor="criteria">
          <textarea
            id="criteria"
            name="criteria"
            required
            rows={3}
            maxLength={500}
            placeholder="Badge-in timestamp. Screenshot in the chat before noon."
            className="w-full border border-rule bg-background px-4 py-3 text-base placeholder:text-muted focus:border-foreground focus:outline-none"
          />
          <p className="mt-2 text-xs text-muted">
            Write it now, while nobody knows who wins. This is the thing you&apos;ll
            argue about later.
          </p>
        </Field>

        <Field label="Person market" htmlFor="has_subject">
          <label className="flex items-baseline gap-3">
            <input
              id="has_subject"
              name="has_subject"
              type="checkbox"
              checked={hasSubject}
              onChange={(event) => setHasSubject(event.target.checked)}
              className="accent-foreground"
            />
            <span>This market is about a specific person</span>
          </label>
          <p className="mt-2 text-xs text-muted">
            Sidebar uses their private phone identity to prevent them from betting.
          </p>
          {hasSubject && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <input
                name="subject_name"
                type="text"
                required
                maxLength={40}
                placeholder="Their name"
                className={INPUT}
              />
              <input
                name="subject_phone"
                type="tel"
                required
                autoComplete="off"
                placeholder="Their phone number"
                className={INPUT}
              />
            </div>
          )}
        </Field>

        <Field label="Seeding ends" htmlFor="reveal_at">
          <input
            id="reveal_at"
            name="reveal_at"
            type="datetime-local"
            required
            ref={reveal}
            className={INPUT}
          />
          <p className="mt-2 text-xs text-muted">
            Until then, stakes are sealed and no odds exist.
          </p>
        </Field>

        <Field label="Closes" htmlFor="close_at">
          <input
            id="close_at"
            name="close_at"
            type="datetime-local"
            required
            ref={close}
            className={INPUT}
          />
        </Field>

        <Field label="Resolution opens" htmlFor="resolve_at" last>
          <input
            id="resolve_at"
            name="resolve_at"
            type="datetime-local"
            required
            ref={resolve}
            className={INPUT}
          />
          <p className="mt-2 text-xs text-muted">
            The assigned adjudicator can settle it from this time onward.
          </p>
        </Field>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="mt-6 h-11 bg-foreground px-6 text-sm text-background transition-opacity hover:opacity-80 disabled:opacity-40"
      >
        {pending ? "…" : "Open the market"}
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
