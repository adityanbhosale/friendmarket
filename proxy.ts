import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  decodeSession,
  SESSION_COOKIE,
} from "./app/lib/session-token";

/**
 * A persistent session should feel persistent. If a returning member opens the
 * landing page or the new-group page in a fresh tab, send them to the group
 * named by their signed cookie. `/group` still rechecks the live membership,
 * so a stale or revoked UUID cannot authorize anything.
 */
export function proxy(request: NextRequest) {
  const session = decodeSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.next();
  return NextResponse.redirect(new URL("/group", request.url));
}

export const config = {
  matcher: ["/", "/start"],
};
