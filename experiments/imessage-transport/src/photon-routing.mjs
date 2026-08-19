const ROUTING_RETRY_DELAYS_MS = [100, 250, 500];

// Photon can emit a message before its chat/sender relationship has settled in
// Messages' SQLite write-ahead log. Re-read briefly before treating it as unusable.
export async function settleMessageRouting(sdk, message) {
  return settleRouting(sdk, message, { requireParticipant: true });
}

// Messages authored by this iMessage account have no participant handle. For
// the opt-in single-number test, wait only for the conversation relationship.
export async function settleMessageConversation(sdk, message) {
  return settleRouting(sdk, message, { requireParticipant: false });
}

async function settleRouting(sdk, message, { requireParticipant }) {
  if (isSettled(message, requireParticipant)) return message;

  const createdAt =
    message.createdAt instanceof Date ? message.createdAt : new Date(message.createdAt);

  for (const delayMs of ROUTING_RETRY_DELAYS_MS) {
    await delay(delayMs);
    const candidates = await sdk.getMessages({
      since: new Date(createdAt.getTime() - 1_000),
      before: new Date(createdAt.getTime() + 1_000),
      service: "iMessage",
      limit: 50,
    });
    const settled = candidates.find((candidate) => candidate.id === message.id);
    if (isSettled(settled, requireParticipant)) return settled;
  }
  return message;
}

function isSettled(message, requireParticipant) {
  return Boolean(
    message?.chatId && message.chatKind && (!requireParticipant || message.participant),
  );
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
