// Authorization. Read-side helpers, safe to call from Server Components.
// The write side (joining) lives in actions.ts.

import { redirect } from "next/navigation";
import { selectOne } from "./db";
import { getSession, type Session } from "./session";

export type User = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  created_at: string;
};

export type Group = {
  id: string;
  name: string;
  link_id: string;
  created_at: string;
};

/**
 * The session cookie asserts a user and a group. It is signed, so it cannot be
 * forged — but it can outlive the rows it names (group deleted, membership
 * revoked). Re-checking membership on every request is what makes revocation
 * take effect rather than waiting 30 days for the cookie to expire.
 */
export async function currentMembership(): Promise<{
  session: Session;
  user: User;
  group: Group;
} | null> {
  const session = await getSession();
  if (!session) return null;

  const membership = await selectOne<{ group_id: string; user_id: string }>(
    "group_members",
    { group_id: `eq.${session.gid}`, user_id: `eq.${session.uid}` },
  );
  if (!membership) return null;

  const [user, group] = await Promise.all([
    selectOne<User>("users", { id: `eq.${session.uid}` }),
    selectOne<Group>("groups", { id: `eq.${session.gid}` }),
  ]);
  if (!user || !group) return null;

  return { session, user, group };
}

/** Same, but sends anyone without a live membership to the join page. */
export async function requireMembership() {
  const membership = await currentMembership();
  if (!membership) redirect("/join");
  return membership;
}
