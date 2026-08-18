// Cookie binding for sessions. The token format and its crypto live in
// session-token.ts, which has no Next.js imports and is directly testable.

import { cookies } from "next/headers";
import {
  decodeSession,
  encodeSession,
  MAX_AGE_SECONDS,
  SESSION_COOKIE,
  type Session,
} from "./session-token";

export { SESSION_COOKIE, fingerprint, type Session } from "./session-token";

/**
 * Issues the cookie. Must be called from a Server Function or Route Handler —
 * cookies cannot be set while a Server Component is rendering.
 */
export async function createSession(uid: string, gid: string): Promise<void> {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS;
  const store = await cookies();

  store.set(SESSION_COOKIE, encodeSession({ uid, gid, exp }), {
    httpOnly: true,
    // Off in dev so the cookie survives http://localhost.
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

/** Reads and verifies the current session. Safe in Server Components. */
export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  return decodeSession(store.get(SESSION_COOKIE)?.value);
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
