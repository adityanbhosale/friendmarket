import assert from "node:assert/strict";
import test from "node:test";
import { createSidebarAgent, executeIntent } from "../src/sidebar-agent.mjs";

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

test("agent binds the iMessage identities before parsing or executing", async () => {
  const calls = [];
  const client = {
    requireMembership: async (...args) => calls.push(["membership", ...args]),
    listMarkets: async (...args) => {
      calls.push(["list", ...args]);
      return [{ market, totals: marketResult().totals }];
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
    text: "Sidebar, show markets",
  });

  assert.deepEqual(calls, [
    ["membership", GROUP_ID, USER_ID],
    ["list", GROUP_ID],
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
  const result = await agent({ conversationId: "chat", senderId: "sender", text: "Sidebar help" });
  assert.match(result, /not connected.*Sidebar, start/);
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
    text: "Sidebar, start",
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
  const result = await agent({ conversationId: "chat-1", senderId: "sender-1", text: "Sidebar start" });
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
  const result = await agent({ conversationId: "chat-1", senderId: "sender-1", text: "Sidebar start" });
  assert.equal(issued, false);
  assert.match(result, /Would create/);
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
