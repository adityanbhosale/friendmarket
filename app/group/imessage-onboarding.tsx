"use client";

import { useState } from "react";
import {
  formatSidebarImessageNumber,
  sidebarSmsHref,
} from "../lib/imessage-number";

export function ImessageOnboarding({
  groupCode,
  sidebarNumber,
}: {
  groupCode: string;
  sidebarNumber: string;
}) {
  const [status, setStatus] = useState("");
  const command = `@sidebar start ${groupCode}`;

  async function openMessages() {
    try {
      await navigator.clipboard.writeText(command);
      setStatus("Command copied. Paste it into Messages and send.");
    } catch {
      setStatus("Copy the command shown above, then paste it into Messages.");
    }

    window.location.assign(sidebarSmsHref(sidebarNumber));
  }

  return (
    <section className="mt-10 border-t border-foreground pt-5">
      <p className="text-xs tracking-wider text-muted uppercase">Use in iMessage</p>
      <h2 className="mt-3 text-lg leading-snug font-medium">
        Connect this group to Sidebar in Messages.
      </h2>
      <ol className="mt-5 grid gap-3 text-sm leading-relaxed text-muted">
        <li>
          <span className="mr-2 font-mono text-foreground">01</span>
          Message Sidebar at {formatSidebarImessageNumber(sidebarNumber)} this
          command from your registered phone number.
        </li>
        <li>
          <span className="mr-2 font-mono text-foreground">02</span>
          After the confirmation, add Sidebar to your iMessage group chat.
        </li>
        <li>
          <span className="mr-2 font-mono text-foreground">03</span>
          Send <span className="font-mono text-foreground">@sidebar help</span> in
          that chat to finish linking it.
        </li>
      </ol>

      <p className="mt-5 overflow-x-auto border border-rule bg-[#fafafa] px-4 py-3 font-mono text-sm whitespace-nowrap">
        {command}
      </p>
      <button
        type="button"
        onClick={openMessages}
        className="mt-4 h-11 bg-foreground px-5 text-sm text-background transition-opacity hover:opacity-80"
      >
        Copy command & open Messages →
      </button>
      <p role="status" aria-live="polite" className="mt-3 min-h-5 text-xs text-muted">
        {status}
      </p>
    </section>
  );
}
