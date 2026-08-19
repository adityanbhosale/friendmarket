"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function GroupCodeForm() {
  const router = useRouter();
  const [code, setCode] = useState("");

  return (
    <form
      className="max-w-[420px]"
      onSubmit={(event) => {
        event.preventDefault();
        const normalized = code.trim().toUpperCase();
        if (normalized) router.push(`/join/${encodeURIComponent(normalized)}`);
      }}
    >
      <div className="border-t border-b border-foreground py-4">
        <label htmlFor="group_code" className="mb-2 block text-xs text-muted">
          Group code
        </label>
        <input
          id="group_code"
          type="text"
          required
          autoComplete="off"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="e.g. K7QM-3XPD"
          className="h-11 w-full border border-rule bg-background px-4 text-base uppercase placeholder:text-muted focus:border-foreground focus:outline-none"
        />
      </div>
      <button
        type="submit"
        className="mt-6 h-11 bg-foreground px-6 text-sm text-background transition-opacity hover:opacity-80"
      >
        Continue →
      </button>
    </form>
  );
}
