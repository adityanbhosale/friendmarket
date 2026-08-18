import assert from "node:assert/strict";
import test from "node:test";
import { createBindingResolver, loadSidebarBindings } from "../src/sidebar-bindings.mjs";

const GROUP_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";

test("loads one local conversation and sender binding from environment values", () => {
  const bindings = loadSidebarBindings({
    SIDEBAR_IMESSAGE_CONVERSATION_HASH: "a26cb18099e4",
    SIDEBAR_GROUP_ID: GROUP_ID,
    SIDEBAR_IMESSAGE_USER_MAP: JSON.stringify({ "34023a9ca954": USER_ID }),
  });
  const resolve = createBindingResolver(bindings);

  assert.deepEqual(resolve("a26cb18099e4", "34023a9ca954"), {
    status: "bound",
    groupId: GROUP_ID,
    userId: USER_ID,
  });
  assert.deepEqual(resolve("a26cb18099e4", "ffffffffffff"), {
    status: "unbound_sender",
    groupId: GROUP_ID,
  });
  assert.deepEqual(resolve("000000000000", "34023a9ca954"), {
    status: "unbound_group",
  });
});

test("rejects malformed binding configuration", () => {
  assert.throws(
    () =>
      loadSidebarBindings({
        SIDEBAR_IMESSAGE_CONVERSATION_HASH: "not-a-hash",
        SIDEBAR_GROUP_ID: GROUP_ID,
        SIDEBAR_IMESSAGE_USER_MAP: "{}",
      }),
    /invalid 12-character conversation hash/,
  );
});
