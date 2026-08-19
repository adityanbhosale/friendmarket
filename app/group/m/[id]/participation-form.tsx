"use client";

import { useActionState } from "react";
import { joinMarket, leaveMarket, type FormState } from "../../../lib/actions";

export function ParticipationForm({
  marketId,
  joined,
  canLeave = true,
}: {
  marketId: string;
  joined: boolean;
  canLeave?: boolean;
}) {
  const target = joined ? leaveMarket : joinMarket;
  const [state, action, pending] = useActionState<FormState, FormData>(target, {});

  return (
    <form action={action} className="border-t border-foreground pt-6">
      <input type="hidden" name="market_id" value={marketId} />
      <p className="text-sm text-muted">
        {joined
          ? "You joined this market. You can leave until you place a stake."
          : "Join before placing a stake. Viewing never requires joining."}
      </p>
      {(!joined || canLeave) && (
        <button
          type="submit"
          disabled={pending}
          className={
            joined
              ? "mt-4 text-sm text-muted underline decoration-1 underline-offset-4 hover:text-foreground disabled:opacity-40"
              : "mt-4 h-11 bg-foreground px-6 text-sm text-background transition-opacity hover:opacity-80 disabled:opacity-40"
          }
        >
          {pending ? "…" : joined ? "Leave market" : "Join market"}
        </button>
      )}
      <p role="status" aria-live="polite" className="mt-3 text-sm text-muted">
        {state.error ?? ""}
      </p>
    </form>
  );
}
