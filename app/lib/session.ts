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
  const expires = new Date(exp * 1000);
  const store = await cookies();

  store.set(SESSION_COOKIE, encodeSession({ uid, gid, exp }), {
    httpOnly: true,
    // Off in dev so the cookie survives http://localhost.
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
    expires,
    priority: "high",
  });

  // Keep only the signed member/group IDs after sign-out. This is a display
  // hint, never authentication: returning entry still requires both the group
  // password and the registered phone identity.
  const rememberedExp = Math.floor(Date.now() / 1000) + REMEMBERED_MAX_AGE_SECONDS;
  store.set(REMEMBERED_COOKIE, encodeSession({ uid, gid, exp: rememberedExp }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: REMEMBERED_MAX_AGE_SECONDS,
    expires: new Date(rememberedExp * 1000),
    priority: "medium",
  });
}

/** Reads and verifies the current session. Safe in Server Components. */
export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  return decodeSession(store.get(SESSION_COOKIE)?.value);
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  // Sessions issued before the remembered-member feature have no hint cookie.
  // Capture their signed IDs at sign-out so the very next entry gets the same
  // streamlined return path as newer sessions.
  const current = decodeSession(store.get(SESSION_COOKIE)?.value);
  if (current) {
    const rememberedExp = Math.floor(Date.now() / 1000) + REMEMBERED_MAX_AGE_SECONDS;
    store.set(
      REMEMBERED_COOKIE,
      encodeSession({ uid: current.uid, gid: current.gid, exp: rememberedExp }),
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: REMEMBERED_MAX_AGE_SECONDS,
        expires: new Date(rememberedExp * 1000),
        priority: "medium",
      },
    );
  }
  store.delete(SESSION_COOKIE);
}

export const REMEMBERED_COOKIE = "sidebar_remembered_member";
const REMEMBERED_MAX_AGE_SECONDS = 180 * 24 * 60 * 60;

/** A signed identity hint. It grants no access and is re-verified on entry. */
export async function getRememberedSession(): Promise<Session | null> {
  const store = await cookies();
  return decodeSession(store.get(REMEMBERED_COOKIE)?.value);
}

// ---------------------------------------------------------------------------
// The welcome interstitial
// ---------------------------------------------------------------------------
// Joining sets the session cookie, and the join pages send anyone holding a
// session to /group. Those two facts together meant the single submit that
// issues a recovery code redirected straight past the only screen that shows
// it. This flag marks that one request as different: a membership was created
// just now, so the notice gets to render before the guard applies.
//
// It is set only on first entry, cleared by the Continue button, and expires
// on its own if the tab is abandoned. It authorises nothing — the session
// cookie is still what proves identity — so its only power is to defer one
// redirect.

export const WELCOME_COOKIE = "sidebar_welcome";
const WELCOME_MAX_AGE = 15 * 60; // Long enough to write a code down.

export async function markWelcomePending(): Promise<void> {
  const store = await cookies();
  store.set(WELCOME_COOKIE, "1", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: WELCOME_MAX_AGE,
  });
}

/** Safe in Server Components — reads only. */
export async function welcomePending(): Promise<boolean> {
  const store = await cookies();
  return store.get(WELCOME_COOKIE)?.value === "1";
}

export async function clearWelcomePending(): Promise<void> {
  const store = await cookies();
  store.delete(WELCOME_COOKIE);
}
