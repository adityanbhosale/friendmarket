// Shared layout primitives. No hooks, no state — safe to render from both the
// client landing page and the static /docs and /card routes.

import Link from "next/link";

export function Shell({ children }: { children: React.ReactNode }) {
  return <div className="broadsheet">{children}</div>;
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-sm text-muted">{children}</span>;
}

export function Nav({ current }: { current?: "card" | "rules" }) {
  return (
    <nav className="flex items-baseline gap-5 text-sm">
      <NavLink href="/card" active={current === "card"}>
        Card
      </NavLink>
      <NavLink href="/docs" active={current === "rules"}>
        Rules
      </NavLink>
    </nav>
  );
}

function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  if (active) {
    return (
      <span aria-current="page" className="text-foreground">
        {children}
      </span>
    );
  }
  return (
    <Link href={href} className="text-muted hover:text-foreground">
      {children}
    </Link>
  );
}
