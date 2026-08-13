// Shared layout primitives. No hooks, no state — safe to render from both the
// client landing page and the static /docs route.

export function Shell({ children }: { children: React.ReactNode }) {
  return <div className="broadsheet">{children}</div>;
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-sm text-muted">{children}</span>;
}
