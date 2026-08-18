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
