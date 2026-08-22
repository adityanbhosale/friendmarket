import assert from "node:assert/strict";
import test from "node:test";
import {
  createDirectOnboardingHandler,
  deriveRegisteredPhoneHash,
  isGroupRecoveryRequest,
  normalizePhoneNumber,
  parseWebStartRequest,
} from "../src/web-onboarding.mjs";

test("parses only a complete Sidebar web onboarding command", () => {
  assert.equal(parseWebStartRequest("@sidebar start k7qm3xpd"), "K7QM-3XPD");
  assert.equal(parseWebStartRequest(" @Sidebar, start K7QM-3XPD "), "K7QM-3XPD");
  assert.equal(parseWebStartRequest("@sidebar start"), null);
  assert.equal(parseWebStartRequest("please @sidebar start K7QM-3XPD"), null);
  assert.equal(parseWebStartRequest("@sidebar start ABIO-1001"), null);
});

test("recognizes only explicit direct-message group recovery requests", () => {
  assert.equal(isGroupRecoveryRequest("@sidebar"), true);
  assert.equal(isGroupRecoveryRequest("@sidebar groups"), true);
  assert.equal(isGroupRecoveryRequest("@sidebar group code"), true);
  assert.equal(isGroupRecoveryRequest("@sidebar recover"), true);
  assert.equal(isGroupRecoveryRequest("please @sidebar"), false);
  assert.equal(isGroupRecoveryRequest("@sidebar start K7QM-3XPD"), false);
});

test("derives the same phone identity for common US number formats", () => {
  const secret = "test-session-secret";
  assert.equal(normalizePhoneNumber("(212) 555-0199"), "+12125550199");
  assert.equal(
    deriveRegisteredPhoneHash("+1 (212) 555-0199", secret),
    deriveRegisteredPhoneHash("2125550199", secret),
  );
});

test("stages a verified web group and replies with the native group step", async () => {
  const calls = [];
  const replies = [];
  const handler = createDirectOnboardingHandler({
    client: {
      stageImessageWebLink: async (input) => {
        calls.push(input);
        return { groupName: "Monkey Business" };
      },
    },
    hashIdentity: (kind, value) => `${kind}:${value}`,
    sessionSecret: "test-session-secret",
    send: async (message) => replies.push(message),
    now: () => new Date("2026-08-21T20:00:00.000Z"),
  });

  assert.equal(
    await handler({
      id: "message-1",
      chatId: "direct-chat-1",
      participant: "+12125550199",
      text: "@sidebar start K7QM-3XPD",
    }),
    true,
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].senderHash, "sender:+12125550199");
  assert.equal(calls[0].groupLinkId, "K7QM-3XPD");
  assert.equal(calls[0].phoneHash.length, 64);
  assert.equal(calls[0].expiresAt, "2026-08-22T20:00:00.000Z");
  assert.deepEqual(replies, [
    {
      to: "direct-chat-1",
      text: "You're all set for Monkey Business. Add me to the iMessage group chat, then send “@sidebar help” there.",
    },
  ]);
});

test("ignores ordinary direct messages and rejects an Apple ID email identity", async () => {
  const replies = [];
  const handler = createDirectOnboardingHandler({
    client: { stageImessageWebLink: async () => assert.fail("must not stage") },
    hashIdentity: () => "hash",
    sessionSecret: "test-session-secret",
    send: async (message) => replies.push(message),
  });

  assert.equal(
    await handler({ chatId: "dm", participant: "+12125550199", text: "hello" }),
    false,
  );
  assert.equal(
    await handler({
      chatId: "dm",
      participant: "member@example.com",
      text: "@sidebar start K7QM-3XPD",
    }),
    true,
  );
  assert.match(replies[0].text, /couldn't verify.*phone number/i);
});

test("recovers only groups attached to the direct sender's phone identity", async () => {
  const calls = [];
  const replies = [];
  const handler = createDirectOnboardingHandler({
    client: {
      listGroupsForPhone: async (phoneHash) => {
        calls.push(phoneHash);
        return [
          { groupName: "Monkey Business", groupCode: "K7QM-3XPD" },
          { groupName: "Lake House", groupCode: "ABCD-EFGH" },
        ];
      },
    },
    hashIdentity: () => "unused",
    sessionSecret: "test-session-secret",
    appUrl: "https://www.trysidebar.xyz/",
    send: async (message) => replies.push(message),
  });

  assert.equal(
    await handler({ chatId: "dm-1", participant: "+12125550199", text: "@sidebar" }),
    true,
  );
  assert.equal(calls[0].length, 64);
  assert.match(replies[0].text, /Monkey Business: K7QM-3XPD/);
  assert.match(replies[0].text, /Lake House: ABCD-EFGH/);
  assert.match(replies[0].text, /shared group password is not included/i);
});

test("group recovery reveals nothing for an unregistered phone", async () => {
  const replies = [];
  const handler = createDirectOnboardingHandler({
    client: { listGroupsForPhone: async () => [] },
    hashIdentity: () => "unused",
    sessionSecret: "test-session-secret",
    send: async (message) => replies.push(message),
  });
  await handler({ chatId: "dm-1", participant: "+12125550199", text: "@sidebar groups" });
  assert.match(replies[0].text, /couldn't find a Sidebar group/i);
  assert.equal(replies[0].text.includes("K7QM-3XPD"), false);
});
