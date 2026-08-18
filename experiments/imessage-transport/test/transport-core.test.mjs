import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyInbound,
  createMessageProcessor,
  fingerprint,
  isTaggedTestTraffic,
  normalizePhotonMessage,
} from "../src/transport-core.mjs";

function groupMessage(overrides = {}) {
  return {
    id: "message-1",
    chatId: "any;+;group-1",
    chatKind: "group",
    participant: "+15550000001",
    text: "sidebar G1-A-01 ping",
    kind: "text",
    service: "iMessage",
    isFromMe: false,
    createdAt: new Date("2026-08-18T16:00:00.000Z"),
    ...overrides,
  };
}

test("normalizes the provider message into a transport envelope", () => {
  const envelope = normalizePhotonMessage(groupMessage());
  assert.deepEqual(envelope, {
    provider: "photon-local",
    eventId: "message-1",
    messageId: "message-1",
    conversationId: "any;+;group-1",
    isGroup: true,
    senderId: "+15550000001",
    text: "sidebar G1-A-01 ping",
    receivedAt: "2026-08-18T16:00:00.000Z",
    kind: "text",
    service: "iMessage",
    isFromMe: false,
  });
});

test("replies to explicit Sidebar commands and correlation tags", () => {
  const command = classifyInbound(normalizePhotonMessage(groupMessage()));
  assert.deepEqual(command, {
    action: "reply",
    correlationTag: "G1-A-01",
    replyText: "ACK G1-A-01",
  });

  const tagOnly = classifyInbound(
    normalizePhotonMessage(groupMessage({ text: "G2-C-09 odds" })),
  );
  assert.equal(tagOnly.action, "reply");
  assert.equal(tagOnly.replyText, "ACK G2-C-09");
});

test("ignores ordinary chatter, DMs, non-text events, and messages from the bot", () => {
  const cases = [
    [groupMessage({ text: "where are we meeting?" }), "ordinary_chatter"],
    [groupMessage({ text: "ordinary chatter G1-N-01" }), "ordinary_chatter"],
    [groupMessage({ chatKind: "dm" }), "not_group"],
    [groupMessage({ kind: "memberAdded" }), "not_text"],
    [groupMessage({ isFromMe: true }), "from_me"],
  ];

  for (const [message, reason] of cases) {
    assert.deepEqual(classifyInbound(normalizePhotonMessage(message)), {
      action: "ignore",
      reason,
    });
  }
});

test("limits live evidence collection to explicitly tagged test traffic", () => {
  assert.equal(isTaggedTestTraffic("where are we meeting?"), false);
  assert.equal(isTaggedTestTraffic("ordinary chatter G1-N-01"), true);
  assert.equal(isTaggedTestTraffic("sidebar G1-A-01 ping"), true);
});

test("deduplicates events and always replies to the received conversation", async () => {
  const replies = [];
  const evidence = [];
  const processMessage = createMessageProcessor({
    sendReply: async (...args) => replies.push(args),
    recordEvidence: async (entry) => evidence.push(entry),
  });
  const envelope = normalizePhotonMessage(groupMessage());

  await processMessage(envelope);
  const duplicate = await processMessage(envelope);

  assert.deepEqual(replies, [["any;+;group-1", "ACK G1-A-01"]]);
  assert.deepEqual(duplicate, { action: "ignore", reason: "duplicate_event" });
  assert.equal(evidence[0].result, "replied");
  assert.equal(evidence[1].reason, "duplicate_event");
});

test("labels dry-run command evidence without claiming a message was sent", async () => {
  const evidence = [];
  const processMessage = createMessageProcessor({
    sendReply: async () => false,
    recordEvidence: async (entry) => evidence.push(entry),
  });

  await processMessage(normalizePhotonMessage(groupMessage()));

  assert.equal(evidence[0].result, "would_reply");
});

test("redacted fingerprints are stable and do not expose identifiers", () => {
  const value = "+15550000001";
  const hash = fingerprint(value);
  assert.equal(hash, fingerprint(value));
  assert.equal(hash.length, 12);
  assert.equal(hash.includes(value), false);
});
