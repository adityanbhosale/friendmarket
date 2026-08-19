import assert from "node:assert/strict";
import test from "node:test";
import {
  settleMessageConversation,
  settleMessageRouting,
} from "../src/photon-routing.mjs";

test("a self-authored message needs a conversation but no participant", async () => {
  const message = {
    id: "self-1",
    chatId: "group-1",
    chatKind: "group",
    participant: null,
  };
  const sdk = {
    getMessages: async () => assert.fail("an already settled conversation should not re-read"),
  };
  assert.equal(await settleMessageConversation(sdk, message), message);
});

test("an inbound message still requires both conversation and sender", async () => {
  const message = {
    id: "inbound-1",
    chatId: "group-1",
    chatKind: "group",
    participant: null,
    createdAt: new Date("2026-08-18T16:00:00.000Z"),
  };
  const settled = { ...message, participant: "+15550000001" };
  let reads = 0;
  const sdk = {
    getMessages: async () => {
      reads += 1;
      return [settled];
    },
  };
  assert.equal(await settleMessageRouting(sdk, message), settled);
  assert.equal(reads, 1);
});
