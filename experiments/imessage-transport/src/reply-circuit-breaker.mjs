const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_IDENTICAL_COOLDOWN_MS = 10_000;
const DEFAULT_MAX_REPLIES = 20;

export function createReplyCircuitBreaker({
  now = () => Date.now(),
  windowMs = DEFAULT_WINDOW_MS,
  identicalCooldownMs = DEFAULT_IDENTICAL_COOLDOWN_MS,
  maxReplies = DEFAULT_MAX_REPLIES,
} = {}) {
  const replies = [];

  const allowMany = (texts) => {
    const timestamp = now();
    while (replies[0]?.timestamp <= timestamp - windowMs) replies.shift();

    const candidates = texts.map((text) => String(text));
    if (replies.length + candidates.length > maxReplies) return false;
    const recent = new Set(
      replies
        .filter((reply) => reply.timestamp > timestamp - identicalCooldownMs)
        .map((reply) => reply.text),
    );
    if (candidates.some((text) => recent.has(text))) return false;

    for (const text of candidates) replies.push({ text, timestamp });
    return true;
  };

  return {
    allow: (text) => allowMany([text]),
    allowMany,
  };
}
