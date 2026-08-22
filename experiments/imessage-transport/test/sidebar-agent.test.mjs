import assert from "node:assert/strict";
import test from "node:test";
import { createSidebarAgent, executeIntent } from "../src/sidebar-agent.mjs";
import { SidebarDbError } from "../src/sidebar-client.mjs";

const NOW = new Date("2026-08-18T16:00:00.000Z");
const GROUP_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";

const market = {
  id: "market-id",
  group_id: GROUP_ID,
  display_num: 3,
  question: "Will Dan be late?",
  reveal_at: "2026-08-18T15:00:00.000Z",
  close_at: "2026-08-18T18:00:00.000Z",
  resolve_at: "2026-08-18T18:00:01.000Z",
  resolved_at: null,
  void_reason: null,
  adjudicator_id: USER_ID,
};

function marketResult() {
  return {
    market,
    sides: [
      { id: "yes-id", label: "Yes", ordinal: 0 },
      { id: "no-id", label: "No", ordinal: 1 },
    ],
    pools: [
      { side_id: "yes-id", pool: 75, revealed: true },
      { side_id: "no-id", pool: 25, revealed: true },
    ],
    totals: { total_pool: 100, participants: 2, revealed: true },
    myStakes: [{ amount: 40 }],
    payouts: [],
    adjudicatorName: "Yash",
  };
}

test("executes a parsed bet through the deterministic Sidebar client", async () => {
  const calls = [];
  const result = await executeIntent({
    client: {
      placeBet: async (input) => {
        calls.push(input);
        return marketResult();
      },
    },
    intent: {
      action: "place_bet",
      marketNumber: 3,
      amount: 40,
      side: "yes",
    },
    binding: { groupId: GROUP_ID, userId: USER_ID },
    now: NOW,
    dryRun: false,
  });

  assert.deepEqual(calls, [
    { groupId: GROUP_ID, userId: USER_ID, marketNumber: 3, side: "yes", amount: 40 },
  ]);
  assert.match(result, /Bet placed: 40 points on Yes/);
  assert.match(result, /Yes 75% \(75\).*Pot 100 points/);
});

test("dry-run write requests never call a mutation", async () => {
  let called = false;
  const result = await executeIntent({
    client: { placeBet: async () => (called = true) },
    intent: { action: "place_bet", marketNumber: 3, amount: 10, side: "no" },
    binding: { groupId: GROUP_ID, userId: USER_ID },
    now: NOW,
    dryRun: true,
  });
  assert.equal(called, false);
  assert.equal(result, "Would bet 10 points on No in market #3.");
});

test("holds a likely person market and prompts for the subject phone", async () => {
  const calls = [];
  const result = await executeIntent({
    client: { stageMarketDraft: async (input) => calls.push(input) },
    intent: {
      action: "create_market",
      question: "Will Dan be late?",
      criteria: "Dan arrives after 9pm.",
      revealAt: "2026-08-18T16:00:01.000Z",
      closeAt: "2026-08-18T18:00:00.000Z",
      resolveAt: "2026-08-18T18:00:01.000Z",
      subjectName: "Dan",
      subjectPhone: null,
    },
    binding: { groupId: GROUP_ID, userId: USER_ID },
    now: NOW,
    dryRun: false,
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].subjectName, "Dan");
  assert.equal(calls[0].expiresAt, "2026-08-18T16:15:00.000Z");
  assert.match(result, /phone number should be blocked/i);
  assert.match(result, /@sidebar subject Dan/);
  assert.match(result, /@sidebar no subject/);
});

test("finishes a pending person market with only a one-way phone hash", async () => {
  const calls = [];
  const result = await executeIntent({
    client: {
      completeMarketDraft: async (input) => {
        calls.push(input);
        return {
          display_num: 4,
          question: "Will Dan be late?",
          subject_name: "Dan",
          close_at: "2026-08-18T18:00:00.000Z",
        };
      },
    },
    intent: {
      action: "complete_person_market",
      subjectName: "Dan",
      subjectPhone: "+12125550199",
    },
    binding: { groupId: GROUP_ID, userId: USER_ID },
    now: NOW,
    hashPhone: (value) => (value === "+12125550199" ? "h".repeat(64) : null),
    dryRun: false,
  });

  assert.deepEqual(calls, [{
    groupId: GROUP_ID,
    userId: USER_ID,
    subjectName: "Dan",
    subjectPhoneHash: "h".repeat(64),
  }]);
  assert.equal(JSON.stringify(calls).includes("+12125550199"), false);
  assert.match(result, /Subject: Dan cannot join or bet/);
});

test("can finish the prompted draft as a non-person market", async () => {
  const calls = [];
  const result = await executeIntent({
    client: {
      completeMarketDraft: async (input) => {
        calls.push(input);
        return {
          display_num: 6,
          question: "Will Bitcoin rise?",
          subject_name: null,
          close_at: "2026-08-18T18:00:00.000Z",
        };
      },
    },
    intent: { action: "complete_market_without_subject" },
    binding: { groupId: GROUP_ID, userId: USER_ID },
    now: NOW,
    dryRun: false,
  });
  assert.deepEqual(calls, [{ groupId: GROUP_ID, userId: USER_ID }]);
  assert.doesNotMatch(result, /cannot join or bet/);
});

test("creates an inline person market without storing the raw phone", async () => {
  const calls = [];
  await executeIntent({
    client: {
      openMarket: async (input) => {
        calls.push(input);
        return {
          display_num: 5,
          question: input.question,
          subject_name: input.subjectName,
          close_at: input.closeAt,
        };
      },
    },
    intent: {
      action: "create_market",
      question: "Will Dan be late?",
      criteria: "Dan arrives after 9pm.",
      revealAt: "2026-08-18T16:00:01.000Z",
      closeAt: "2026-08-18T18:00:00.000Z",
      resolveAt: "2026-08-18T18:00:01.000Z",
      subjectName: "Dan",
      subjectPhone: "+12125550199",
    },
    binding: { groupId: GROUP_ID, userId: USER_ID },
    now: NOW,
    hashPhone: () => "h".repeat(64),
    dryRun: false,
  });
  assert.equal(calls[0].subjectPhoneHash, "h".repeat(64));
  assert.equal(Object.hasOwn(calls[0], "subjectPhone"), false);
});

test("agent binds the iMessage identities before parsing or executing", async () => {
  const calls = [];
  const client = {
    requireMembership: async (...args) => calls.push(["membership", ...args]),
    listMarkets: async (...args) => {
      calls.push(["list", ...args]);
      return [{ market, totals: marketResult().totals, adjudicatorName: "Yash", joined: true }];
    },
  };
  const agent = createSidebarAgent({
    client,
    resolveBinding: () => ({ status: "bound", groupId: GROUP_ID, userId: USER_ID }),
    parseIntent: async ({ markets }) => {
      assert.deepEqual(markets, [market]);
      return { action: "list_markets" };
    },
    now: () => NOW,
  });

  const result = await agent({
    conversationId: "chat-1",
    senderId: "+15550000001",
    text: "@sidebar, show markets",
  });

  assert.deepEqual(calls, [
    ["membership", GROUP_ID, USER_ID],
    ["list", GROUP_ID, USER_ID],
  ]);
  assert.match(result, /#3 Will Dan be late\?/);
});

test("unbound identities cannot reach the database", async () => {
  const agent = createSidebarAgent({
    client: {
      requireMembership: async () => assert.fail("database should not be called"),
      listMarkets: async () => assert.fail("database should not be called"),
    },
    resolveBinding: () => ({ status: "unbound_sender", groupId: GROUP_ID }),
  });
  const result = await agent({ conversationId: "chat", senderId: "sender", text: "@sidebar help" });
  assert.match(result, /not connected.*@sidebar, start/);
});

test("Sidebar start issues a setup link before any market access", async () => {
  const setupCalls = [];
  const agent = createSidebarAgent({
    client: {
      requireMembership: async () => assert.fail("database should not be called"),
      listMarkets: async () => assert.fail("database should not be called"),
    },
    resolveBinding: async () => ({ status: "unbound_group" }),
    issueSetupLink: async (input) => {
      setupCalls.push(input);
    },
  });

  const result = await agent({
    conversationId: "chat-1",
    senderId: "+15550000001",
    text: "@sidebar, start",
  });

  assert.deepEqual(setupCalls, [
    { conversationId: "chat-1", senderId: "+15550000001", groupId: null },
  ]);
  assert.match(result, /sent you a one-time Sidebar setup link directly/);
  assert.match(result, /expires in 15 minutes/);
});

test("Sidebar start attaches an unbound sender to the conversation's group", async () => {
  const setupCalls = [];
  const agent = createSidebarAgent({
    client: {},
    resolveBinding: async () => ({ status: "unbound_sender", groupId: GROUP_ID }),
    issueSetupLink: async (input) => {
      setupCalls.push(input);
    },
  });
  await agent({ conversationId: "chat-1", senderId: "sender-2", text: "@Sidebar start" });
  assert.equal(setupCalls[0].groupId, GROUP_ID);
});

test("Sidebar start does not issue another link for an existing binding", async () => {
  let issued = false;
  const agent = createSidebarAgent({
    client: {},
    resolveBinding: async () => ({ status: "bound", groupId: GROUP_ID, userId: USER_ID }),
    issueSetupLink: async () => {
      issued = true;
    },
  });
  const result = await agent({ conversationId: "chat-1", senderId: "sender-1", text: "@sidebar start" });
  assert.equal(issued, false);
  assert.match(result, /already connected/);
});

test("dry-run Sidebar start does not persist a setup token", async () => {
  let issued = false;
  const agent = createSidebarAgent({
    client: {},
    resolveBinding: async () => ({ status: "unbound_group" }),
    issueSetupLink: async () => {
      issued = true;
    },
    dryRun: true,
  });
  const result = await agent({ conversationId: "chat-1", senderId: "sender-1", text: "@sidebar start" });
  assert.equal(issued, false);
  assert.match(result, /Would create/);
});

test("unprefixed text is ignored before binding or database access", async () => {
  let called = false;
  const agent = createSidebarAgent({
    client: {},
    resolveBinding: async () => {
      called = true;
      return { status: "bound", groupId: GROUP_ID, userId: USER_ID };
    },
  });
  assert.equal(
    await agent({ conversationId: "chat", senderId: "sender", text: "Sidebar, show markets" }),
    null,
  );
  assert.equal(called, false);
});

test("formats final payouts after deterministic resolution", async () => {
  const result = await executeIntent({
    client: {
      resolveMarket: async () => ({
        result: "resolved",
        market: marketResult(),
        payouts: [{ name: "Adam", amount: 160 }, { name: "Brent", amount: 40 }],
      }),
    },
    intent: { action: "resolve_market", marketNumber: 3, side: "yes" },
    binding: { groupId: GROUP_ID, userId: USER_ID },
    now: NOW,
    dryRun: false,
  });
  assert.equal(result, "Resolved market #3: Yes.\nFinal payouts: Adam 160 · Brent 40");
});

test("joins a group-scoped market before betting", async () => {
  const calls = [];
  const result = await executeIntent({
    client: { joinMarket: async (input) => calls.push(input) },
    intent: { action: "join_market", marketNumber: 3 },
    binding: { groupId: GROUP_ID, userId: USER_ID },
    now: NOW,
    dryRun: false,
  });
  assert.deepEqual(calls, [{ groupId: GROUP_ID, userId: USER_ID, marketNumber: 3 }]);
  assert.equal(result, "Joined market #3. You can now place a bet.");
});

test("turns an asynchronous database rejection into one user-facing reply", async () => {
  const agent = createSidebarAgent({
    client: {
      requireMembership: async () => undefined,
      listMarkets: async () => [{ market, totals: marketResult().totals }],
      resolveMarket: async () => {
        throw new SidebarDbError(
          "Sidebar database request failed (400)",
          400,
          JSON.stringify({ message: "market has not closed yet" }),
        );
      },
    },
    resolveBinding: async () => ({ status: "bound", groupId: GROUP_ID, userId: USER_ID }),
    parseIntent: async () => ({ action: "resolve_market", marketNumber: 3, side: "void" }),
    now: () => NOW,
  });

  const reply = await agent({
    conversationId: "chat-1",
    senderId: "sender-1",
    text: "@sidebar, resolve Dan being late as void",
  });
  assert.equal(reply, "I couldn't complete that: market has not closed yet");
});
