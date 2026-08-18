import assert from "node:assert/strict";
import test from "node:test";

process.env.SESSION_SECRET = "test-session-secret-with-enough-entropy";

test("session tokens verify signatures and expiry", async () => {
  const { decodeSession, encodeSession } = await import("../app/lib/session-token");
  const live = { uid: "user", gid: "group", exp: Math.floor(Date.now() / 1000) + 60 };
  const token = encodeSession(live);
  assert.deepEqual(decodeSession(token), live);
  assert.equal(decodeSession(`${token.slice(0, -1)}x`), null);
  assert.equal(
    decodeSession(
      encodeSession({ uid: "user", gid: "group", exp: Math.floor(Date.now() / 1000) - 1 }),
    ),
    null,
  );
});

test("password hashes verify only the original password", async () => {
  const { hashPassword, verifyPassword } = await import("../app/lib/password");
  const hash = await hashPassword("correct horse battery staple");
  assert.equal(await verifyPassword("correct horse battery staple", hash), true);
  assert.equal(await verifyPassword("wrong password", hash), false);
  assert.equal(await verifyPassword("anything", "malformed"), false);
});
