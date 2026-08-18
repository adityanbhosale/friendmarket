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
  recovery_code_hash: string | null;
  created_at: string;
};

export type Group = {
  id: string;
  name: string;
  link_id: string;
  created_at: string;
  /** The admin. Null for groups opened before the column existed. */
  created_by: string | null;
  /** Where registration and health mail goes. Not on users.email, which is unique. */
  admin_email: string | null;
};

/**
 * Admin is a single person: whoever opened the group. There is no grant path
 * and nothing to revoke, which is the point — the role exists so one named
 * person holds the group ID and can see the state of the board, not to build
 * a permission system a fifteen-person group chat does not need.
 */
export function isAdmin(group: Group, user: User): boolean {
  return group.created_by !== null && group.created_by === user.id;
}

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

/**
 * For the admin view. A member who is not the admin is sent to their own
 * dashboard rather than shown a refusal: they are allowed to be here, just not
 * on this page, and a 403 would overstate what happened.
 */
export async function requireAdmin() {
  const membership = await requireMembership();
  if (!isAdmin(membership.group, membership.user)) redirect("/group");
  return membership;
}
