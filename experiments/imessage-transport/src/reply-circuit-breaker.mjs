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

  return {
    allow(text) {
      const timestamp = now();
      while (replies[0]?.timestamp <= timestamp - windowMs) replies.shift();

      if (replies.length >= maxReplies) return false;
      if (
        replies.some(
          (reply) =>
            reply.text === text && reply.timestamp > timestamp - identicalCooldownMs,
        )
      ) {
        return false;
      }

      replies.push({ text, timestamp });
      return true;
    },
  };
}
