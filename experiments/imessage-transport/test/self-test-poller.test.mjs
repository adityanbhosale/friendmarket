import assert from "node:assert/strict";
import test from "node:test";
import { startSelfMessagePolling } from "../src/self-test-poller.mjs";

test("self polling forwards only accepted from-me messages in chronological order", async () => {
  const received = [];
  const sdk = {
    getMessages: async () => [
      { id: "new", isFromMe: true, text: "Sidebar newer", createdAt: "2026-08-18T16:00:02Z" },
      { id: "peer", isFromMe: false, text: "Sidebar peer", createdAt: "2026-08-18T16:00:01Z" },
      { id: "old", isFromMe: true, text: "Sidebar older", createdAt: "2026-08-18T16:00:00Z" },
      { id: "chat", isFromMe: true, text: "ordinary", createdAt: "2026-08-18T16:00:03Z" },
    ],
  };
  const stop = startSelfMessagePolling({
    sdk,
    accept: (message) => message.text.startsWith("Sidebar"),
    onMessage: async (message) => received.push(message.id),
    intervalMs: 60_000,
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  await stop();
  assert.deepEqual(received, ["old", "new"]);
});
