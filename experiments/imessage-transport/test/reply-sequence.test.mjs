import assert from "node:assert/strict";
import test from "node:test";

import {
  configuredReplyDelay,
  replyMessages,
  sendReplySequence,
} from "../src/reply-sequence.mjs";

test("turns compact newline replies into separate iMessage bubbles", () => {
  assert.deepEqual(replyMessages("got it\n40 on yes\nnew odds: 60/40"), [
    "got it",
    "40 on yes",
    "new odds: 60/40",
  ]);
});

test("sends reply bubbles in order with a small pause", async () => {
  const events = [];
  await sendReplySequence({
    reply: ["first", "second", "third"],
    delayMs: 350,
    send: async (text) => events.push(["send", text]),
    wait: async (milliseconds) => events.push(["wait", milliseconds]),
  });
  assert.deepEqual(events, [
    ["send", "first"],
    ["wait", 350],
    ["send", "second"],
    ["wait", 350],
    ["send", "third"],
  ]);
});

test("bounds configured reply pacing", () => {
  assert.equal(configuredReplyDelay("0"), 0);
  assert.equal(configuredReplyDelay("9000"), 2000);
  assert.equal(configuredReplyDelay("nope"), 350);
});
