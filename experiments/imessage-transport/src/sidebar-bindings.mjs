const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH = /^[0-9a-f]{12}$/i;

export function loadSidebarBindings(env = process.env) {
  if (env.SIDEBAR_IMESSAGE_BINDINGS) {
    return validateBindings(JSON.parse(env.SIDEBAR_IMESSAGE_BINDINGS));
  }

  const conversationHash = env.SIDEBAR_IMESSAGE_CONVERSATION_HASH;
  const groupId = env.SIDEBAR_GROUP_ID;
  const users = parseUserMap(env.SIDEBAR_IMESSAGE_USER_MAP);
  if (!conversationHash && !groupId && Object.keys(users).length === 0) return [];
  return validateBindings([{ conversationHash, groupId, users }]);
}

export function createBindingResolver(bindings) {
  const byConversation = new Map(
    bindings.map((binding) => [binding.conversationHash.toLowerCase(), binding]),
  );
  return function resolveBinding(conversationHash, senderHash) {
    const group = byConversation.get(String(conversationHash).toLowerCase());
    if (!group) return { status: "unbound_group" };
    const userId = group.users[String(senderHash).toLowerCase()];
    if (!userId) return { status: "unbound_sender", groupId: group.groupId };
    return { status: "bound", groupId: group.groupId, userId };
  };
}

function parseUserMap(value) {
  if (!value) return {};
  const parsed = JSON.parse(value);
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error("SIDEBAR_IMESSAGE_USER_MAP must be a JSON object.");
  }
  return parsed;
}

function validateBindings(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("At least one Sidebar iMessage binding is required.");
  }
  return value.map((binding, index) => {
    if (!HASH.test(binding?.conversationHash ?? "")) {
      throw new Error(`Binding ${index + 1} has an invalid 12-character conversation hash.`);
    }
    if (!UUID.test(binding?.groupId ?? "")) {
      throw new Error(`Binding ${index + 1} has an invalid Sidebar group UUID.`);
    }
    if (!binding.users || Array.isArray(binding.users) || typeof binding.users !== "object") {
      throw new Error(`Binding ${index + 1} needs a users object.`);
    }
    const users = {};
    for (const [senderHash, userId] of Object.entries(binding.users)) {
      if (!HASH.test(senderHash) || !UUID.test(userId)) {
        throw new Error(`Binding ${index + 1} has an invalid sender hash or user UUID.`);
      }
      users[senderHash.toLowerCase()] = userId;
    }
    return {
      conversationHash: binding.conversationHash.toLowerCase(),
      groupId: binding.groupId,
      users,
    };
  });
}
