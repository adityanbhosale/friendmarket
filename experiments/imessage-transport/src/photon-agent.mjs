import { IMessageSDK } from "@photon-ai/imessage-kit";
import {
  createImessageIdentityHasher,
  generateImessageSetupToken,
} from "./imessage-identity.mjs";
import { isAgentInvocation } from "./intent-parser.mjs";
import { settleMessageRouting } from "./photon-routing.mjs";
import { createSidebarAgent } from "./sidebar-agent.mjs";
import { createBindingResolver, loadSidebarBindings } from "./sidebar-bindings.mjs";
import { createSidebarClient } from "./sidebar-client.mjs";
import { fingerprint, normalizePhotonMessage } from "./transport-core.mjs";

const dryRun = process.env.SIDEBAR_AGENT_DRY_RUN === "1";
const seen = new Set();
let sdk;

try {
  const bindings = loadSidebarBindings();
  const client = createSidebarClient();
  const staticBindingResolver = createBindingResolver(bindings);
  const identitySecret = process.env.SIDEBAR_IMESSAGE_ID_SECRET;
  const hashIdentity = identitySecret
    ? createImessageIdentityHasher(identitySecret)
    : null;
  const appUrl = process.env.SIDEBAR_APP_URL?.replace(/\/$/, "");

  const resolveBinding = async (conversationHash, senderHash, raw) => {
    if (hashIdentity) {
      const persistent = await client.resolveImessageBinding(
        hashIdentity("conversation", raw.conversationId),
        hashIdentity("sender", raw.senderId),
      );
      if (persistent.status !== "unbound_group") return persistent;
    }
    return staticBindingResolver(conversationHash, senderHash);
  };

  const issueSetupLink =
    hashIdentity && appUrl
      ? async ({ conversationId, senderId, groupId }) => {
          const { token, tokenHash } = generateImessageSetupToken();
          await client.createImessageSetup({
            tokenHash,
            conversationHash: hashIdentity("conversation", conversationId),
            senderHash: hashIdentity("sender", senderId),
            groupId,
            expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
          });
          const setupUrl = `${appUrl}/imessage/setup?token=${encodeURIComponent(token)}`;
          await sdk.send({
            to: senderId,
            text: [
              "Finish connecting iMessage to Sidebar:",
              setupUrl,
              "This one-time link expires in 15 minutes.",
            ].join("\n"),
          });
        }
      : null;
  const agent = createSidebarAgent({
    client,
    resolveBinding,
    issueSetupLink,
    dryRun,
  });
  sdk = new IMessageSDK({ maxConcurrentSends: 1 });

  await sdk.startWatching({
    onGroupMessage: async (message) => {
      if (!isAgentInvocation(message.text ?? "")) return;
      const settled = await settleMessageRouting(sdk, message);
      const envelope = normalizePhotonMessage(settled);
      if (!isEligible(envelope) || seen.has(envelope.eventId)) return;
      seen.add(envelope.eventId);

      const reply = await agent(envelope);
      if (!reply) return;
      if (!dryRun) await sdk.send({ to: envelope.conversationId, text: reply });
      writeStatus({
        status: dryRun ? "would_reply" : "replied",
        eventHash: fingerprint(envelope.eventId),
        conversationHash: fingerprint(envelope.conversationId),
        senderHash: fingerprint(envelope.senderId),
      });
    },
    onError: (error) => writeStatus({ status: "watch_error", message: error.message }),
  });

  writeStatus({ status: "watching", dryRun, trigger: "explicit Sidebar request" });
  await waitForShutdown();
} catch (error) {
  writeStatus({
    status: "failed",
    message: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
  if (sdk) await sdk.close().catch(() => undefined);
}

function isEligible(envelope) {
  return (
    !envelope.isFromMe &&
    envelope.isGroup &&
    envelope.service === "iMessage" &&
    envelope.kind === "text" &&
    Boolean(envelope.conversationId) &&
    Boolean(envelope.senderId)
  );
}

function writeStatus(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function waitForShutdown() {
  return new Promise((resolve) => {
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
