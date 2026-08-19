import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";

process.env.SESSION_SECRET = "test-session-secret-with-enough-entropy";

test("returning sessions are routed from entry pages to their group", async () => {
  const [{ proxy }, { encodeSession, SESSION_COOKIE }] = await Promise.all([
    import("../proxy"),
    import("../app/lib/session-token"),
  ]);
  const token = encodeSession({
    uid: "member-uuid",
    gid: "group-uuid",
    exp: Math.floor(Date.now() / 1000) + 60,
  });
  const request = new NextRequest("https://sidebar.example/", {
    headers: { cookie: `${SESSION_COOKIE}=${token}` },
  });

  const response = proxy(request);
  assert.equal(response.status, 307);
  assert.equal(response.headers.get("location"), "https://sidebar.example/group");
});

test("missing or expired sessions can still reach entry pages", async () => {
  const [{ proxy }, { encodeSession, SESSION_COOKIE }] = await Promise.all([
    import("../proxy"),
    import("../app/lib/session-token"),
  ]);
  const expired = encodeSession({
    uid: "member-uuid",
    gid: "group-uuid",
    exp: Math.floor(Date.now() / 1000) - 1,
  });

  assert.equal(proxy(new NextRequest("https://sidebar.example/")).status, 200);
  assert.equal(
    proxy(
      new NextRequest("https://sidebar.example/start", {
        headers: { cookie: `${SESSION_COOKIE}=${expired}` },
      }),
    ).status,
    200,
  );
});
