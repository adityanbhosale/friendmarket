"use client";

import { useState } from "react";
import { continueToGroup } from "./lib/actions";

/**
 * The one screen that ever shows a recovery code.
 *
 * Continue is a form rather than a link because leaving has a side effect:
 * it clears the flag that is holding the join pages' redirect open, and only
 * a Server Function may write cookies. Where no flag was set — the group's
 * creator, who was never redirected — the action simply finds nothing to
 * clear and moves on.
 */
export function RecoveryCodeNotice({
  code,
  groupId,
  memberId,
  compact = false,
}: {
  code: string;
  groupId?: string;
  memberId?: string;
  compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  // Copies the whole set, not just the code: these are the three things a
  // person needs later, and one of them is unrecoverable.
  const block = [
    groupId ? `Group code: ${groupId}` : null,
    `Recovery code: ${code}`,
    memberId ? `Member ID: ${memberId}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  async function copy() {
    await navigator.clipboard.writeText(block);
    setCopied(true);
  }

  return (
    <div className="max-w-[520px] border-t border-b border-foreground py-6">
      <p className="font-medium">Save your recovery code now.</p>
      <p className="measure mt-2 text-sm leading-relaxed text-muted">
        It restores this identity, points, and stakes on another device. We keep
        only a hash of it, so it will not be shown again and nobody can send it
        to you later. We have emailed a copy — but email can fail quietly, so
        write it down before you continue.
      </p>

      <dl className="mt-5 border-t border-rule">
        {groupId && <Line label="Group code" value={groupId} />}
        <Line label="Recovery code" value={code} strong />
        {memberId && <Line label="Member ID" value={memberId} last />}
      </dl>

      <div className="mt-5 flex flex-wrap items-center gap-5">
        <button
          type="button"
          onClick={copy}
          className="h-10 border border-foreground px-5 text-sm hover:opacity-60"
        >
          {copied ? "Copied" : "Copy all three"}
        </button>

        {!compact && (
          <form action={continueToGroup}>
            <button
              type="submit"
              className="h-10 bg-foreground px-5 text-sm text-background hover:opacity-80"
            >
              I&apos;ve saved it — continue →
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function Line({
  label,
  value,
  strong = false,
  last = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
  last?: boolean;
}) {
  return (
    <div className={last ? "py-3" : "border-b border-rule py-3"}>
      <dt className="text-xs text-muted">{label}</dt>
      <dd
        className={`mt-1 overflow-x-auto font-mono break-all ${
          strong ? "text-base" : "text-sm"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
