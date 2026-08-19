import assert from "node:assert/strict";
import test from "node:test";
import {
  LOCAL_SELF_SENDER_ID,
  loadSelfTestConfig,
  normalizeSelfTestMessage,
  resolveSelfTestBinding,
} from "../src/self-test-routing.mjs";
import { fingerprint } from "../src/transport-core.mjs";

const GROUP_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const CHAT_ID = "any;+;single-number-test";

function fromMeMessage(overrides = {}) {
  return {
    id: "message-self-1",
    chatId: CHAT_ID,
    chatKind: "group",
    participant: null,
    text: "Sidebar, show markets",
    kind: "text",
    service: "iMessage",
    isFromMe: true,
    createdAt: new Date("2026-08-18T16:00:00.000Z"),
    ...overrides,
  };
}

test("self-test mode is disabled by default", () => {
  assert.equal(loadSelfTestConfig({}), null);
});

test("self-test mode requires an exact redacted conversation", () => {
  assert.throws(
    () => loadSelfTestConfig({ SIDEBAR_ALLOW_SELF_TEST: "1" }),
    /SIDEBAR_IMESSAGE_CONVERSATION_HASH/,
  );
});

test("adapts only from-me traffic from the configured conversation", () => {
  const config = loadSelfTestConfig({
    SIDEBAR_ALLOW_SELF_TEST: "1",
    SIDEBAR_IMESSAGE_CONVERSATION_HASH: fingerprint(CHAT_ID),
  });
  const envelope = normalizeSelfTestMessage(fromMeMessage(), config);
  assert.equal(envelope.senderId, LOCAL_SELF_SENDER_ID);
  assert.equal(envelope.isFromMe, false);
  assert.equal(
    normalizeSelfTestMessage(fromMeMessage({ chatId: "another-chat" }), config),
    null,
  );
  assert.equal(
    normalizeSelfTestMessage(
      fromMeMessage({ text: "ACK G1-SELF-01" }),
      config,
    ),
    null,
  );
});

test("self-test agent binding requires explicit group and user IDs", () => {
  const config = loadSelfTestConfig(
    {
      SIDEBAR_ALLOW_SELF_TEST: "1",
      SIDEBAR_IMESSAGE_CONVERSATION_HASH: fingerprint(CHAT_ID),
      SIDEBAR_GROUP_ID: GROUP_ID,
      SIDEBAR_SELF_TEST_USER_ID: USER_ID,
    },
    { requireBinding: true },
  );
  assert.deepEqual(resolveSelfTestBinding(config, LOCAL_SELF_SENDER_ID), {
    status: "bound",
    groupId: GROUP_ID,
    userId: USER_ID,
  });
  assert.equal(resolveSelfTestBinding(config, "someone-else"), null);
});
