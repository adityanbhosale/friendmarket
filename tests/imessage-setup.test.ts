import assert from "node:assert/strict";
import test from "node:test";
import { completedSetupMatchesBinding } from "../app/lib/imessage-setup-state";

const setup = {
  conversation_hash: "conversation-hash",
  sender_hash: "sender-hash",
};

test("a completed iMessage setup matches only its resulting binding", () => {
  assert.equal(
    completedSetupMatchesBinding(setup, {
      conversationHash: "conversation-hash",
      senderHash: "sender-hash",
      groupId: "group-1",
      userId: "user-1",
    }),
    true,
  );
  assert.equal(
    completedSetupMatchesBinding(setup, {
      conversationHash: "conversation-hash",
      senderHash: "another-sender",
      groupId: "group-1",
      userId: "user-1",
    }),
    false,
  );
  assert.equal(
    completedSetupMatchesBinding(setup, {
      conversationHash: "another-conversation",
      senderHash: "sender-hash",
      groupId: "group-1",
      userId: "user-1",
    }),
    false,
  );
});
