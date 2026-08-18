const ROUTING_RETRY_DELAYS_MS = [100, 250, 500];

// Photon can emit a message before its chat/sender relationship has settled in
// Messages' SQLite write-ahead log. Re-read briefly before treating it as unusable.
export async function settleMessageRouting(sdk, message) {
  if (message.chatId && message.participant) return message;

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
    if (settled?.chatId && settled.participant) return settled;
  }
  return message;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
