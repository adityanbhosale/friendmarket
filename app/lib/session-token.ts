// Session token format, with no Next.js coupling — pure functions over strings
// so they can be exercised directly. The cookie binding lives in session.ts.
//
// Format is `<payload-base64url>.<hmac-base64url>`, HMAC-SHA256 over the
// payload. The payload is signed, not encrypted — readable by whoever holds the
// cookie, so it carries ids and an expiry and nothing else. No name, no email,
// no password material.
//
// Deliberately not a JWT: no library, no algorithm-confusion surface, and no
// `alg: none` to get wrong. HS256 over a fixed format is the whole requirement.

import { createHmac, timingSafeEqual } from "node:crypto";

const SECRET = process.env.SESSION_SECRET;

if (!SECRET) {
  throw new Error(
    "Missing SESSION_SECRET. Generate with: openssl rand -base64 32",
  );
}

export const SESSION_COOKIE = "sidebar_session";
export const MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days

export type Session = {
  /** users.id */
  uid: string;
  /** groups.id — the group this session is scoped to. */
  gid: string;
  /** Unix seconds. */
  exp: number;
};

function sign(payload: string): string {
  return createHmac("sha256", SECRET!).update(payload).digest("base64url");
}

export function encodeSession(session: Session): string {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/** Verifies signature and expiry. Returns null on anything suspect. */
export function decodeSession(token: string | undefined): Session | null {
  if (!token) return null;

  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;

  const payload = token.slice(0, dot);
  const provided = Buffer.from(token.slice(dot + 1), "base64url");
  const expected = Buffer.from(sign(payload), "base64url");

  // Length check first: timingSafeEqual throws on a mismatch.
  if (provided.length !== expected.length) return null;
  if (!timingSafeEqual(provided, expected)) return null;

  try {
    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString(),
    ) as Session;

    if (typeof parsed.uid !== "string" || typeof parsed.gid !== "string") {
      return null;
    }
    if (typeof parsed.exp !== "number" || parsed.exp * 1000 < Date.now()) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** HMAC of an arbitrary string — used to store client IPs without storing IPs. */
export function fingerprint(value: string): string {
  return createHmac("sha256", SECRET!).update(value).digest("base64url");
}
