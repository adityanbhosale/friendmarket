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
