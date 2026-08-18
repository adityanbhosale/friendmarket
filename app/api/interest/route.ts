// Landing-page waitlist. Same request and response contract as the Vercel KV
// version this replaced — { name } in, { position, returning } out — so the
// form on the landing page did not change.
//
// Signups land in `signups`, not `users`. Leaving a name on a marketing page is
// not the same act as being a person who can hold stakes, and users.id is a
// foreign-key target for stakes.user_id.

import { count, insert, selectOne, DbError } from "../../lib/db";

const MAX_NAME_LENGTH = 40;

type Signup = { id: number; name: string; created_at: string };

/**
 * Position is computed as "how many signups have an id at or below mine"
 * rather than read off the identity column directly, because a rejected insert
 * still consumes an identity value and would leave visible gaps.
 */
function positionOf(id: number): Promise<number> {
  return count("signups", { id: `lte.${id}` });
}

export async function POST(request: Request) {
  let name: string;
  try {
    const body = (await request.json()) as { name?: unknown };
    name = typeof body.name === "string" ? body.name.trim() : "";
  } catch {
    return Response.json({ error: "Send some JSON." }, { status: 400 });
  }

  if (!name) {
    return Response.json({ error: "Need a name." }, { status: 400 });
  }
  if (name.length > MAX_NAME_LENGTH) {
    name = name.slice(0, MAX_NAME_LENGTH);
  }

  const key = name.toLowerCase();

  try {
    // Already on the list? Hand back the original spot instead of burning a new
    // one, so a double-tap doesn't bump anyone.
    const existing = await selectOne<Signup>("signups", {
      name_key: `eq.${key}`,
    });
    if (existing) {
      return Response.json({
        position: await positionOf(existing.id),
        returning: true,
      });
    }

    const created = await insert<Signup>("signups", { name });
    return Response.json({
      position: await positionOf(created.id),
      returning: false,
    });
  } catch (error) {
    // Two simultaneous submissions of the same name: one insert wins, the other
    // hits the unique index. The loser is a returning signup, not an error.
    if (error instanceof DbError && error.isConflict) {
      const existing = await selectOne<Signup>("signups", {
        name_key: `eq.${key}`,
      });
      if (existing) {
        return Response.json({
          position: await positionOf(existing.id),
          returning: true,
        });
      }
    }

    console.error("[/api/interest]", error);
    return Response.json(
      { error: "Couldn't save that. Try again." },
      { status: 500 },
    );
  }
}
