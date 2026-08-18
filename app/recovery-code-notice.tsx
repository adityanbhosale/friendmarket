"use client";

import Link from "next/link";
import { useState } from "react";

export function RecoveryCodeNotice({
  code,
  groupId,
  compact = false,
}: {
  code: string;
  groupId?: string;
  compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
  }

  return (
    <div className="max-w-[520px] border-t border-b border-foreground py-6">
      <p className="font-medium">Save your recovery code now.</p>
      <p className="measure mt-2 text-sm leading-relaxed text-muted">
        It restores this identity, points, and stakes on another device. It will
        not be shown again.
      </p>

      {groupId && (
        <p className="mt-5 text-xs text-muted">
          Group ID <span className="ml-2 font-mono text-foreground">{groupId}</span>
        </p>
      )}
      <code className="mt-2 block overflow-x-auto border border-rule px-4 py-3 font-mono text-sm">
        {code}
      </code>

      <div className="mt-5 flex flex-wrap items-center gap-5">
        <button
          type="button"
          onClick={copy}
          className="h-10 bg-foreground px-5 text-sm text-background hover:opacity-80"
        >
          {copied ? "Copied" : "Copy code"}
        </button>
        {!compact && (
          <Link href="/group" className="text-sm text-muted hover:text-foreground">
            Continue to group →
          </Link>
        )}
      </div>
    </div>
  );
}
