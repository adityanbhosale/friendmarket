"use client";

import { useActionState } from "react";
import { placeStake, resolveMarket, type FormState } from "../../../lib/actions";

type SideOption = { id: string; label: string };

export function StakeForm({
  marketId,
  sides,
  balance,
  sealed,
}: {
  marketId: string;
  sides: SideOption[];
  balance: number;
  sealed: boolean;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    placeStake,
    {},
  );

  return (
    <form action={action} className="border-t border-foreground pt-6">
      <input type="hidden" name="market_id" value={marketId} />

      <fieldset>
        <legend className="text-xs text-muted">Your side</legend>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
          {sides.map((side, i) => (
            <label key={side.id} className="flex items-baseline gap-2">
              <input
                type="radio"
                name="side_id"
                value={side.id}
                required
                defaultChecked={i === 0}
                className="accent-foreground"
              />
              <span>{side.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="sm:w-40">
          <label htmlFor="amount" className="mb-2 block text-xs text-muted">
            Points
          </label>
          <input
            id="amount"
            name="amount"
            type="number"
            min={1}
            max={balance}
            step={1}
            required
            className="h-11 w-full border border-rule bg-background px-4 text-base focus:border-foreground focus:outline-none"
          />
        </div>

        <button
          type="submit"
          disabled={pending || balance <= 0}
          className="h-11 bg-foreground px-6 text-sm text-background transition-opacity hover:opacity-80 disabled:opacity-40"
        >
          {pending ? "…" : "Stake"}
        </button>
      </div>

      <p className="mt-3 text-xs text-muted">
        {balance <= 0
          ? "You have no points left to stake."
          : sealed
            ? `${balance.toLocaleString("en-US")} points available. Nobody sees this until seeding ends.`
            : `${balance.toLocaleString("en-US")} points available.`}
      </p>

      <p role="status" aria-live="polite" className="mt-2 text-sm text-muted">
        {state.error ?? ""}
      </p>
    </form>
  );
}

export function ResolveForm({
  marketId,
  sides,
}: {
  marketId: string;
  sides: SideOption[];
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    resolveMarket,
    {},
  );

  return (
    <form action={action} className="border-t border-foreground pt-6">
      <input type="hidden" name="market_id" value={marketId} />

      <fieldset>
        <legend className="text-xs text-muted">What happened</legend>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
          {sides.map((side) => (
            <label key={side.id} className="flex items-baseline gap-2">
              <input
                type="radio"
                name="outcome_side"
                value={side.id}
                required
                className="accent-foreground"
              />
              <span>{side.label}</span>
            </label>
          ))}
          <label className="flex items-baseline gap-2">
            <input
              type="radio"
              name="outcome_side"
              value="void"
              className="accent-foreground"
            />
            <span className="text-muted">Void it</span>
          </label>
        </div>
      </fieldset>

      <button
        type="submit"
        disabled={pending}
        className="mt-5 h-11 bg-foreground px-6 text-sm text-background transition-opacity hover:opacity-80 disabled:opacity-40"
      >
        {pending ? "…" : "Settle"}
      </button>

      <p className="mt-3 text-xs text-muted">
        This pays out the pool and can&apos;t be undone. Voiding refunds every
        stake.
      </p>

      <p role="status" aria-live="polite" className="mt-2 text-sm text-muted">
        {state.error ?? ""}
      </p>
    </form>
  );
}
