// Two speech bubbles leaning into each other, the second overlapping and
// knocking out the first — a conversation happening off to the side.
// Hairline stroke, currentColor, no fill colour: same system as everything else.

const BACK =
  "M3.25 1.75 H12.25 A2.5 2.5 0 0 1 14.75 4.25 V8.75 A2.5 2.5 0 0 1 12.25 11.25 " +
  "H7 L3.5 14.75 L4.6 11.25 H3.25 A2.5 2.5 0 0 1 0.75 8.75 V4.25 " +
  "A2.5 2.5 0 0 1 3.25 1.75 Z";

const FRONT =
  "M11.75 8.25 H20.25 A2.5 2.5 0 0 1 22.75 10.75 V14.25 A2.5 2.5 0 0 1 20.25 16.75 " +
  "L21.5 20.25 L17.5 16.75 H11.75 A2.5 2.5 0 0 1 9.25 14.25 V10.75 " +
  "A2.5 2.5 0 0 1 11.75 8.25 Z";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 22"
      className={className}
      fill="none"
      aria-hidden="true"
    >
      <path
        d={BACK}
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
      {/* Filled with the page ground so it reads as sitting in front. */}
      <path
        d={FRONT}
        fill="var(--background)"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
    </svg>
  );
}
