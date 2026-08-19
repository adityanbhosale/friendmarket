import {
  fingerprint,
  isExplicitSidebarTraffic,
  normalizePhotonMessage,
} from "./transport-core.mjs";

const HASH = /^[0-9a-f]{12}$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const LOCAL_SELF_SENDER_ID = "sidebar-local-self-test";

export function loadSelfTestConfig(env = process.env, { requireBinding = false } = {}) {
  if (env.SIDEBAR_ALLOW_SELF_TEST !== "1") return null;

  const conversationHash = env.SIDEBAR_IMESSAGE_CONVERSATION_HASH;
  if (!HASH.test(conversationHash ?? "")) {
    throw new Error(
      "SIDEBAR_ALLOW_SELF_TEST requires a 12-character SIDEBAR_IMESSAGE_CONVERSATION_HASH.",
    );
  }

  const config = { conversationHash: conversationHash.toLowerCase() };
  if (!requireBinding) return config;

  if (!UUID.test(env.SIDEBAR_GROUP_ID ?? "")) {
    throw new Error("Self-test agent mode requires a valid SIDEBAR_GROUP_ID.");
  }
  if (!UUID.test(env.SIDEBAR_SELF_TEST_USER_ID ?? "")) {
    throw new Error("Self-test agent mode requires a valid SIDEBAR_SELF_TEST_USER_ID.");
  }

  return {
    ...config,
    groupId: env.SIDEBAR_GROUP_ID,
    userId: env.SIDEBAR_SELF_TEST_USER_ID,
  };
}

export function normalizeSelfTestMessage(message, config) {
  if (
    !config ||
    fingerprint(message.chatId) !== config.conversationHash ||
    !isExplicitSidebarTraffic(message.text ?? "")
  ) {
    return null;
  }
  return {
    ...normalizePhotonMessage(message),
    senderId: LOCAL_SELF_SENDER_ID,
    isFromMe: false,
  };
}

export function resolveSelfTestBinding(config, senderId) {
  if (!config || senderId !== LOCAL_SELF_SENDER_ID || !config.groupId || !config.userId) {
    return null;
  }
  return { status: "bound", groupId: config.groupId, userId: config.userId };
}
