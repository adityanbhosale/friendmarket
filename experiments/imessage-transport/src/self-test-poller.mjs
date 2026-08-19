const DEFAULT_INTERVAL_MS = 750;

export function startSelfMessagePolling({
  sdk,
  accept,
  onMessage,
  onError = () => undefined,
  intervalMs = DEFAULT_INTERVAL_MS,
  startedAt = new Date(),
}) {
  let stopped = false;
  let timer = null;
  let inFlight = Promise.resolve();
  const deliveredIds = new Set();

  const tick = async () => {
    try {
      const messages = await sdk.getMessages({
        since: startedAt,
        service: "iMessage",
        limit: 100,
      });
      const accepted = messages
        .filter(
          (message) =>
            message.isFromMe && !deliveredIds.has(message.id) && accept(message),
        )
        .sort((left, right) => new Date(left.createdAt) - new Date(right.createdAt));
      for (const message of accepted) {
        await onMessage(message);
        deliveredIds.add(message.id);
        if (deliveredIds.size > 10_000) {
          deliveredIds.delete(deliveredIds.values().next().value);
        }
      }
    } catch (error) {
      onError(error instanceof Error ? error : new Error(String(error)));
    } finally {
      if (!stopped) timer = setTimeout(schedule, intervalMs);
    }
  };
  const schedule = () => {
    inFlight = tick();
  };

  schedule();
  return async function stop() {
    stopped = true;
    if (timer) clearTimeout(timer);
    await inFlight;
  };
}
