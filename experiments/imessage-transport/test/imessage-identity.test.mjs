import assert from "node:assert/strict";
import test from "node:test";
import {
  createImessageIdentityHasher,
  generateImessageSetupToken,
} from "../src/imessage-identity.mjs";

test("provider identifiers use domain-separated keyed hashes", () => {
  const hash = createImessageIdentityHasher("a-secret-with-at-least-thirty-two-characters");
  const conversation = hash("conversation", "chat-1");
  const sender = hash("sender", "chat-1");
  assert.equal(conversation.length, 64);
  assert.notEqual(conversation, sender);
  assert.equal(conversation.includes("chat-1"), false);
});

test("setup tokens carry 256 random bits and expose only a hash for storage", () => {
  const first = generateImessageSetupToken();
  const second = generateImessageSetupToken();
  assert.equal(first.token.length, 43);
  assert.equal(first.tokenHash.length, 64);
  assert.notEqual(first.token, second.token);
  assert.equal(first.tokenHash.includes(first.token), false);
});
