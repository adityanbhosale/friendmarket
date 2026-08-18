import assert from "node:assert/strict";
import test from "node:test";
import {
  hashImessageSetupToken,
  normalizeImessageSetupToken,
} from "../app/lib/imessage-token";

const TOKEN = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNO_1";

test("iMessage setup tokens accept only 32-byte base64url values", () => {
  assert.equal(TOKEN.length, 43);
  assert.equal(normalizeImessageSetupToken(TOKEN), TOKEN);
  assert.equal(normalizeImessageSetupToken("too-short"), null);
  assert.equal(normalizeImessageSetupToken(`${TOKEN.slice(0, 42)}+`), null);
});

test("iMessage setup tokens are stored as deterministic one-way hashes", () => {
  const digest = hashImessageSetupToken(TOKEN);
  assert.equal(digest.length, 64);
  assert.equal(digest, hashImessageSetupToken(TOKEN));
  assert.equal(digest.includes(TOKEN), false);
});
