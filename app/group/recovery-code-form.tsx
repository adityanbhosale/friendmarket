"use client";

import { useActionState } from "react";
import {
  generateNewRecoveryCode,
  type FormState,
} from "../lib/actions";
import { RecoveryCodeNotice } from "../recovery-code-notice";

export function RecoveryCodeForm({ hasCode }: { hasCode: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    generateNewRecoveryCode,
    {},
  );

  if (state.recoveryCode) {
    return (
      <div className="mt-8">
        <RecoveryCodeNotice
          code={state.recoveryCode}
          groupId={state.groupId}
          compact
        />
      </div>
    );
  }

  return (
    <form action={action} className="mt-8 border-t border-rule pt-5">
      <p className="text-xs leading-relaxed text-muted">
        {hasCode
          ? "Generating a new recovery code permanently replaces the old one."
          : "Create a recovery code before switching devices or clearing cookies."}
      </p>
      <button
        type="submit"
        disabled={pending}
        className="mt-3 text-sm underline decoration-1 underline-offset-4 hover:text-muted disabled:opacity-40"
      >
        {pending ? "…" : hasCode ? "Replace recovery code" : "Create recovery code"}
      </button>
      <p role="status" aria-live="polite" className="mt-2 text-sm text-muted">
        {state.error ?? ""}
      </p>
    </form>
  );
}
