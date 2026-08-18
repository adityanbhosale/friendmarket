import { IMessageSDK } from "@photon-ai/imessage-kit";
import { createEvidenceRecorder } from "./evidence-store.mjs";
import {
  createMessageProcessor,
  fingerprint,
  isTaggedTestTraffic,
  normalizePhotonMessage,
} from "./transport-core.mjs";

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
    sdk = new IMessageSDK({ maxConcurrentSends: 1 });
    if (mode === "--smoke") await runSmoke(sdk);
    else await runWatcher(sdk);
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

async function runWatcher(sdk) {
  const processMessage = createMessageProcessor({
    sendReply: async (conversationId, text) => {
      if (dryRun) return;
      await sdk.send({ to: conversationId, text });
    },
    recordEvidence,
  });

  await sdk.startWatching({
    onGroupMessage: async (message) => {
      if (!isTaggedTestTraffic(message.text ?? "")) return;
      const envelope = normalizePhotonMessage(message);
      await processMessage(envelope);
    },
    onFromMeMessage: async (message) => {
      if (message.chatKind !== "group" || !isTaggedTestTraffic(message.text ?? "")) {
        return;
      }
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
    `${JSON.stringify({ status: "watching", dryRun, trigger: "sidebar|@sidebar|test-tag" })}\n`,
  );

  await new Promise((resolve) => {
    const stop = async () => {
      process.off("SIGINT", stop);
      process.off("SIGTERM", stop);
      await sdk.close();
      resolve();
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  });
}
