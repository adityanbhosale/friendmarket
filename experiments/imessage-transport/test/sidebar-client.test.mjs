import assert from "node:assert/strict";
import test from "node:test";
import { createSidebarClient } from "../src/sidebar-client.mjs";

test("Sidebar client sends the service key only in request headers", async () => {
  const requests = [];
  const client = createSidebarClient({
    url: "https://example.supabase.co",
    key: "secret-test-key",
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      return new Response(JSON.stringify([{ group_id: "g", user_id: "u" }]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  });

  await client.requireMembership("g", "u");
  assert.match(requests[0].url, /group_members/);
  assert.equal(requests[0].init.headers.apikey, "secret-test-key");
  assert.equal(requests[0].init.headers.Authorization, "Bearer secret-test-key");
  assert.equal(requests[0].url.includes("secret-test-key"), false);
});

test("resolves persistent conversation and sender bindings", async () => {
  const responses = [
    [{ conversation_hash: "c".repeat(64), group_id: "group-1" }],
    [{ sender_hash: "s".repeat(64), user_id: "user-1" }],
  ];
  const client = createSidebarClient({
    url: "https://example.supabase.co",
    key: "test-key",
    fetchImpl: async () =>
      new Response(JSON.stringify(responses.shift()), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
  });
  assert.deepEqual(
    await client.resolveImessageBinding("c".repeat(64), "s".repeat(64)),
    { status: "bound", groupId: "group-1", userId: "user-1" },
  );
});

test("keeps overlapping senders isolated by native conversation", async () => {
  const client = createSidebarClient({
    url: "https://example.supabase.co",
    key: "test-key",
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      const conversationHash = parsed.searchParams.get("conversation_hash");
      if (parsed.pathname.endsWith("/imessage_conversations")) {
        return json([
          {
            conversation_hash: conversationHash?.slice(3),
            group_id: conversationHash === `eq.${"a".repeat(64)}` ? "group-a" : "group-b",
          },
        ]);
      }
      if (parsed.pathname.endsWith("/imessage_identities")) {
        return json([
          {
            conversation_hash: conversationHash?.slice(3),
            sender_hash: "s".repeat(64),
            user_id: conversationHash === `eq.${"a".repeat(64)}` ? "user-a" : "user-b",
          },
        ]);
      }
      throw new Error(`Unexpected request: ${url}`);
    },
  });

  assert.deepEqual(await client.resolveImessageBinding("a".repeat(64), "s".repeat(64)), {
    status: "bound",
    groupId: "group-a",
    userId: "user-a",
  });
  assert.deepEqual(await client.resolveImessageBinding("b".repeat(64), "s".repeat(64)), {
    status: "bound",
    groupId: "group-b",
    userId: "user-b",
  });
});

test("stores only setup token and provider hashes", async () => {
  const requests = [];
  const client = createSidebarClient({
    url: "https://example.supabase.co",
    key: "test-key",
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      // PostgREST commonly returns 201 with an empty body for
      // Prefer: return=minimal. That is a successful insert, not a JSON error.
      return new Response(null, { status: 201 });
    },
  });
  await client.createImessageSetup({
    tokenHash: "t".repeat(64),
    conversationHash: "c".repeat(64),
    senderHash: "s".repeat(64),
    expiresAt: "2026-08-18T16:15:00.000Z",
  });
  const body = JSON.parse(requests[0].init.body);
  assert.equal(body.token_hash, "t".repeat(64));
  assert.equal(body.conversation_hash, "c".repeat(64));
  assert.equal(body.sender_hash, "s".repeat(64));
  assert.equal(Object.hasOwn(body, "token"), false);
});

test("stages and claims the web-first iMessage handoff through database RPCs", async () => {
  const requests = [];
  const responses = [
    { group_id: "group-1", user_id: "user-1", group_name: "Monkey Business" },
    { group_id: "group-1", user_id: "user-1" },
  ];
  const client = createSidebarClient({
    url: "https://example.supabase.co",
    key: "test-key",
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      return json(responses.shift());
    },
  });

  const staged = await client.stageImessageWebLink({
    senderHash: "s".repeat(64),
    groupLinkId: "K7QM-3XPD",
    phoneHash: "p".repeat(64),
    expiresAt: "2026-08-22T20:00:00.000Z",
  });
  const claimed = await client.claimImessageWebLink({
    senderHash: "s".repeat(64),
    conversationHash: "c".repeat(64),
  });

  assert.deepEqual(staged, {
    groupId: "group-1",
    userId: "user-1",
    groupName: "Monkey Business",
  });
  assert.deepEqual(claimed, {
    status: "bound",
    groupId: "group-1",
    userId: "user-1",
  });
  assert.match(requests[0].url, /rpc\/stage_imessage_web_link$/);
  assert.match(requests[1].url, /rpc\/claim_imessage_web_link$/);
  assert.equal(JSON.parse(requests[0].init.body).p_group_link_id, "K7QM-3XPD");
});

test("stages and completes a person-market draft through atomic RPCs", async () => {
  const requests = [];
  const responses = [null, "market-1", [{
    id: "market-1",
    group_id: "group-1",
    display_num: 7,
    subject_name: "Dan",
  }]];
  const client = createSidebarClient({
    url: "https://example.supabase.co",
    key: "test-key",
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      const value = responses.shift();
      return value === null ? new Response(null, { status: 204 }) : json(value);
    },
  });

  await client.stageMarketDraft({
    groupId: "group-1",
    userId: "user-1",
    question: "Will Dan be late?",
    criteria: "Dan arrives after 9pm.",
    revealAt: "2026-08-18T16:00:01.000Z",
    closeAt: "2026-08-18T18:00:00.000Z",
    resolveAt: "2026-08-18T18:00:01.000Z",
    subjectName: "Dan",
    expiresAt: "2026-08-18T16:15:00.000Z",
  });
  const market = await client.completeMarketDraft({
    groupId: "group-1",
    userId: "user-1",
    subjectName: "Dan",
    subjectPhoneHash: "h".repeat(64),
  });

  assert.equal(market.id, "market-1");
  assert.match(requests[0].url, /rpc\/stage_imessage_market_draft$/);
  assert.match(requests[1].url, /rpc\/complete_imessage_market_draft$/);
  assert.equal(JSON.stringify(requests).includes("+12125550199"), false);
});

test("lists markets only from the bound Sidebar group", async () => {
  const requests = [];
  const client = createSidebarClient({
    url: "https://example.supabase.co",
    key: "test-key",
    fetchImpl: async (url) => {
      requests.push(url);
      const parsed = new URL(url);
      if (parsed.pathname.endsWith("/markets")) {
        assert.equal(parsed.searchParams.get("group_id"), "eq.group-a");
        return json([
          {
            id: "market-a",
            group_id: "group-a",
            display_num: 1,
            question: "Will Adi be late?",
            adjudicator_id: "user-a",
          },
        ]);
      }
      if (parsed.pathname.endsWith("/market_totals")) return json([]);
      if (parsed.pathname.endsWith("/users")) return json([{ id: "user-a", name: "Ada" }]);
      if (parsed.pathname.endsWith("/market_participants")) {
        assert.equal(parsed.searchParams.get("user_id"), "eq.user-a");
        return json([{ market_id: "market-a", user_id: "user-a" }]);
      }
      throw new Error(`Unexpected request: ${url}`);
    },
  });

  const rows = await client.listMarkets("group-a", "user-a");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].market.group_id, "group-a");
  assert.equal(rows[0].adjudicatorName, "Ada");
  assert.equal(rows[0].joined, true);
  assert.equal(requests.some((url) => url.includes("group-b")), false);
});

test("rejects resolution before the RPC when the sender is not the adjudicator", async () => {
  const requests = [];
  const client = createSidebarClient({
    url: "https://example.supabase.co",
    key: "test-key",
    fetchImpl: async (url) => {
      requests.push(url);
      const pathname = new URL(url).pathname;
      if (pathname.endsWith("/group_members")) return json([{ group_id: "g", user_id: "u" }]);
      if (pathname.endsWith("/markets")) {
        assert.equal(new URL(url).searchParams.get("group_id"), "eq.g");
        return json([{ id: "m", group_id: "g", display_num: 1, adjudicator_id: "judge" }]);
      }
      if (pathname.endsWith("/market_sides")) {
        return json([{ id: "yes", label: "Yes", ordinal: 0 }]);
      }
      if (pathname.endsWith("/market_totals")) return json([]);
      if (pathname.endsWith("/users")) return json([{ id: "judge", name: "Judge" }]);
      return json([]);
    },
  });

  await assert.rejects(
    client.resolveMarket({ groupId: "g", userId: "u", marketNumber: 1, side: "yes" }),
    /permission denied.*adjudicator/i,
  );
  assert.equal(requests.some((url) => url.includes("/rpc/resolve_market")), false);
});

function json(value) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
