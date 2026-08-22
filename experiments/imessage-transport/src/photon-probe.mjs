import { IMessageSDK } from "@photon-ai/imessage-kit";
import { createEvidenceRecorder } from "./evidence-store.mjs";
import {
  createMessageProcessor,
  fingerprint,
  isExplicitSidebarTraffic,
  isTaggedTestTraffic,
  normalizePhotonMessage,
} from "./transport-core.mjs";
import {
  settleMessageConversation,
  settleMessageRouting,
} from "./photon-routing.mjs";
import {
  loadSelfTestConfig,
  normalizeSelfTestMessage,
} from "./self-test-routing.mjs";
import { startSelfMessagePolling } from "./self-test-poller.mjs";
import { createReplyCircuitBreaker } from "./reply-circuit-breaker.mjs";

const mode = process.argv[2];
const dryRun = process.env.SIDEBAR_POC_DRY_RUN === "1";
const recordEvidence = createEvidenceRecorder();

await main();

async function main() {
  if (mode !== "--smoke" && mode !== "--watch") {
    process.stderr.write("Usage: node src/photon-probe.mjs --smoke|--watch\n");
    process.exitCode = 2;
    return;
  }

  let sdk;
  try {
    const selfTest = loadSelfTestConfig();
    sdk = new IMessageSDK({ maxConcurrentSends: 1 });
    if (mode === "--smoke") await runSmoke(sdk);
    else await runWatcher(sdk, selfTest);
  } catch (error) {
    const databaseBlocked =
      error?.code === "DATABASE" && /open database/i.test(error.message ?? "");
    process.stderr.write(
      `${JSON.stringify({
        status: databaseBlocked ? "permission_required" : "failed",
        code: error?.code ?? "UNKNOWN",
        message: databaseBlocked
          ? "Grant Full Disk Access to the app running this command, restart it, and rerun npm run smoke."
          : error instanceof Error
            ? error.message
            : String(error),
      })}\n`,
    );
    process.exitCode = 1;
    if (sdk) await sdk.close().catch(() => undefined);
  }
}

async function runSmoke(sdk) {
  try {
    const groups = await sdk.listChats({
      kind: "group",
      service: "iMessage",
      sortBy: "recent",
      limit: 10,
    });

    process.stdout.write(
      `${JSON.stringify({
        status: "ready",
        groupCount: groups.length,
        groups: groups.map((group) => ({
          conversationHash: fingerprint(group.chatId),
          unreadCount: group.unreadCount,
          lastMessageAt: group.lastMessageAt,
        })),
      })}\n`,
    );
  } finally {
    await sdk.close();
  }
}

async function runWatcher(sdk, selfTest) {
  const replyCircuitBreaker = createReplyCircuitBreaker();
  const processMessage = createMessageProcessor({
    sendReply: async (conversationId, text) => {
      if (dryRun) return false;
      if (!replyCircuitBreaker.allow(text)) return "blocked";
      await sdk.send({ to: conversationId, text });
      return true;
    },
    recordEvidence,
  });

  const handleSelfMessage = async (message) => {
    const settledMessage = await settleMessageConversation(sdk, message);
    if (settledMessage.chatKind !== "group") return;
    const selfTestEnvelope = normalizeSelfTestMessage(settledMessage, selfTest);
    if (selfTestEnvelope) await processMessage(selfTestEnvelope);
  };

  await sdk.startWatching({
    onGroupMessage: async (message) => {
      if (!isTaggedTestTraffic(message.text ?? "")) return;
      const settledMessage = await settleMessageRouting(sdk, message);
      const envelope = normalizePhotonMessage(settledMessage);
      await processMessage(envelope);
    },
    onFromMeMessage: async (message) => {
      if (selfTest && !isExplicitSidebarTraffic(message.text ?? "")) return;
      if (!selfTest && !isTaggedTestTraffic(message.text ?? "")) return;
      if (selfTest) return handleSelfMessage(message);
      await recordEvidence({
        observedAt: new Date().toISOString(),
        provider: "photon-local",
        eventHash: fingerprint(message.id),
        messageHash: fingerprint(message.id),
        conversationHash: fingerprint(message.chatId),
        senderHash: null,
        isGroup: message.chatKind === "group",
        kind: message.kind,
        service: message.service,
        receivedAt:
          message.createdAt instanceof Date
            ? message.createdAt.toISOString()
            : new Date(message.createdAt).toISOString(),
        correlationTag: message.text?.match(/\b(?:DM|G\d+)-[A-Z0-9]+-\d+\b/i)?.[0] ?? null,
        result: "from_me_observed",
        reason: message.isDelivered ? "delivered" : "database_arrival",
      });
    },
    onError: (error) => {
      process.stderr.write(
        `${JSON.stringify({ status: "watch_error", message: error.message })}\n`,
      );
    },
  });

  process.stdout.write(
    `${JSON.stringify({ status: "watching", dryRun, trigger: "sidebar|test-tag" })}\n`,
  );

  const stopSelfPolling = selfTest
    ? startSelfMessagePolling({
        sdk,
        accept: (message) => isExplicitSidebarTraffic(message.text ?? ""),
        onMessage: handleSelfMessage,
        onError: (error) => {
          process.stderr.write(
            `${JSON.stringify({ status: "self_poll_error", message: error.message })}\n`,
          );
        },
      })
    : async () => undefined;

  await new Promise((resolve) => {
    const stop = async () => {
      process.off("SIGINT", stop);
      process.off("SIGTERM", stop);
      await stopSelfPolling();
      await sdk.close();
      resolve();
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  });
}
