// Shared layout primitives. No hooks, no state — safe to render from both the
// client landing page and the static /docs and /slates routes.

import Link from "next/link";
import { Logo } from "./logo";

export type NavKey = "rules" | "join";

export function Shell({ children }: { children: React.ReactNode }) {
  return <div className="broadsheet">{children}</div>;
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-sm text-muted">{children}</span>;
}

export function Nav({ current }: { current?: NavKey }) {
  return (
    <nav className="flex items-baseline gap-5 text-sm">
      <NavLink href="/docs" active={current === "rules"}>
        Rules
      </NavLink>
      <NavLink href="/join" active={current === "join"}>
        Join
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

/**
 * Header lockup. `up` is the destination one level up the path; passing it
 * turns the wordmark into "← Sidebar" and makes the arrow + wordmark a single
 * link. The home page passes nothing and gets a plain, unlinked wordmark.
 * The mark itself is not part of the link.
 */
export function Masthead({
  up,
  current,
}: {
  up?: string;
  current?: NavKey;
}) {
  return (
    <div className="border-b border-rule">
      <Shell>
        <div className="flex items-baseline justify-between gap-6 py-5">
          <span className="type-wordmark flex items-center gap-2 font-medium">
            <Logo className="h-[0.95em] w-auto shrink-0" />
            {up ? (
              <Link href={up} className="hover:text-muted">
                ← Sidebar
              </Link>
            ) : (
              "Sidebar"
            )}
          </span>
          <Nav current={current} />
        </div>
      </Shell>
    </div>
  );
}
