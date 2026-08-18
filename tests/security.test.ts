import assert from "node:assert/strict";
import test from "node:test";

process.env.SESSION_SECRET = "test-session-secret-with-enough-entropy";

test("session tokens verify signatures and expiry", async () => {
  const { decodeSession, encodeSession } = await import("../app/lib/session-token");
  const live = { uid: "user", gid: "group", exp: Math.floor(Date.now() / 1000) + 60 };
  const token = encodeSession(live);
  const replacement = token.endsWith("x") ? "y" : "x";
  assert.deepEqual(decodeSession(token), live);
  assert.equal(decodeSession(`${token.slice(0, -1)}${replacement}`), null);
  assert.equal(
    decodeSession(
      encodeSession({ uid: "user", gid: "group", exp: Math.floor(Date.now() / 1000) - 1 }),
    ),
    null,
  );
});

test("session tokens reject non-canonical base64url signature aliases", async () => {
  const { decodeSession, encodeSession } = await import("../app/lib/session-token");
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const token = encodeSession({
    uid: "user",
    gid: "group",
    exp: Math.floor(Date.now() / 1000) + 60,
  });
  const lastIndex = alphabet.indexOf(token.at(-1)!);

  // A 32-byte signature has a 43-character base64url representation. Its last
  // canonical character has two zero padding bits, so the next alphabet
  // character decodes to the same bytes but is a different textual signature.
  assert.equal(lastIndex % 4, 0);
  const aliasedToken = `${token.slice(0, -1)}${alphabet[lastIndex + 1]}`;
  assert.equal(
    Buffer.from(aliasedToken.split(".")[1], "base64url").equals(
      Buffer.from(token.split(".")[1], "base64url"),
    ),
    true,
  );
  assert.equal(decodeSession(aliasedToken), null);
});

test("password hashes verify only the original password", async () => {
  const { hashPassword, verifyPassword } = await import("../app/lib/password");
  const hash = await hashPassword("correct horse battery staple");
  assert.equal(await verifyPassword("correct horse battery staple", hash), true);
  assert.equal(await verifyPassword("wrong password", hash), false);
  assert.equal(await verifyPassword("anything", "malformed"), false);
});
