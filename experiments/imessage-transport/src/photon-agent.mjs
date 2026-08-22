import { IMessageSDK } from "@photon-ai/imessage-kit";
import {
  createImessageIdentityHasher,
  generateImessageSetupToken,
} from "./imessage-identity.mjs";
import { isAgentInvocation } from "./intent-parser.mjs";
import {
  settleMessageConversation,
  settleMessageRouting,
} from "./photon-routing.mjs";
import { createSidebarAgent } from "./sidebar-agent.mjs";
import { createBindingResolver, loadSidebarBindings } from "./sidebar-bindings.mjs";
import { createSidebarClient } from "./sidebar-client.mjs";
import {
  loadSelfTestConfig,
  normalizeSelfTestMessage,
  resolveSelfTestBinding,
} from "./self-test-routing.mjs";
import { startSelfMessagePolling } from "./self-test-poller.mjs";
import { createReplyCircuitBreaker } from "./reply-circuit-breaker.mjs";
import { fingerprint, normalizePhotonMessage } from "./transport-core.mjs";
import { createDirectOnboardingHandler } from "./web-onboarding.mjs";

const dryRun = process.env.SIDEBAR_AGENT_DRY_RUN === "1";
const seen = new Set();
let sdk;

try {
  const selfTest = loadSelfTestConfig(process.env, { requireBinding: true });
  const bindings = loadSidebarBindings();
  const client = createSidebarClient();
  const staticBindingResolver = createBindingResolver(bindings);
  const identitySecret = process.env.SIDEBAR_IMESSAGE_ID_SECRET;
  const hashIdentity = identitySecret
    ? createImessageIdentityHasher(identitySecret)
    : null;
  const appUrl = process.env.SIDEBAR_APP_URL?.replace(/\/$/, "");
  const sessionSecret = process.env.SESSION_SECRET;
  if (identitySecret && !sessionSecret) {
    throw new Error(
      "Missing SESSION_SECRET. Use the same value as the Sidebar web deployment for phone identity matching.",
    );
  }

  const resolveBinding = async (conversationHash, senderHash, raw) => {
    const selfBinding = resolveSelfTestBinding(selfTest, raw.senderId);
    if (selfBinding) return selfBinding;
    if (hashIdentity) {
      const persistent = await client.resolveImessageBinding(
        hashIdentity("conversation", raw.conversationId),
        hashIdentity("sender", raw.senderId),
      );
      if (persistent.status === "bound") return persistent;
      const claimed = await client.claimImessageWebLink({
        conversationHash: hashIdentity("conversation", raw.conversationId),
        senderHash: hashIdentity("sender", raw.senderId),
      });
      if (claimed) return claimed;
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
  const replyCircuitBreaker = createReplyCircuitBreaker();
  sdk = new IMessageSDK({ maxConcurrentSends: 1 });
  const handleDirectOnboarding =
    hashIdentity && sessionSecret
      ? createDirectOnboardingHandler({
          client,
          hashIdentity,
          sessionSecret,
          send: (outbound) => sdk.send(outbound),
          dryRun,
        })
      : async () => false;

  const handleSelfMessage = async (message) => {
    const settled = await settleMessageConversation(sdk, message);
    const envelope = normalizeSelfTestMessage(settled, selfTest);
    if (envelope) await handleEnvelope(envelope, agent, replyCircuitBreaker);
  };

  await sdk.startWatching({
    onDirectMessage: async (message) => {
      const settled = await settleMessageRouting(sdk, message);
      const handled = await handleDirectOnboarding(settled);
      if (handled) {
        writeStatus({
          status: dryRun ? "would_stage_web_link" : "staged_web_link",
          eventHash: fingerprint(message.id),
          senderHash: fingerprint(message.participant),
        });
      }
    },
    onGroupMessage: async (message) => {
      if (!isAgentInvocation(message.text ?? "")) return;
      const settled = await settleMessageRouting(sdk, message);
      const envelope = normalizePhotonMessage(settled);
      await handleEnvelope(envelope, agent, replyCircuitBreaker);
    },
    onFromMeMessage: async (message) => {
      if (!isAgentInvocation(message.text ?? "")) return;
      if (selfTest) await handleSelfMessage(message);
    },
    onError: (error) => writeStatus({ status: "watch_error", message: error.message }),
  });

  const stopSelfPolling = selfTest
    ? startSelfMessagePolling({
        sdk,
        accept: (message) => isAgentInvocation(message.text ?? ""),
        onMessage: handleSelfMessage,
        onError: (error) => writeStatus({ status: "self_poll_error", message: error.message }),
      })
    : async () => undefined;

  writeStatus({ status: "watching", dryRun, trigger: "explicit Sidebar request" });
  await waitForShutdown(stopSelfPolling);
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

async function handleEnvelope(envelope, agent, replyCircuitBreaker) {
  if (!isEligible(envelope) || seen.has(envelope.eventId)) return;
  seen.add(envelope.eventId);
  if (seen.size > 10_000) seen.delete(seen.values().next().value);

  try {
    const reply = await agent(envelope);
    if (!reply) return;
    if (!dryRun) {
      if (!replyCircuitBreaker.allow(reply)) {
        writeStatus({
          status: "reply_circuit_open",
          eventHash: fingerprint(envelope.eventId),
          conversationHash: fingerprint(envelope.conversationId),
        });
        return;
      }
      await sdk.send({ to: envelope.conversationId, text: reply });
    }
    writeStatus({
      status: dryRun ? "would_reply" : "replied",
      eventHash: fingerprint(envelope.eventId),
      conversationHash: fingerprint(envelope.conversationId),
      senderHash: fingerprint(envelope.senderId),
    });
  } catch (error) {
    seen.delete(envelope.eventId);
    throw error;
  }
}

function writeStatus(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function waitForShutdown(stopSelfPolling) {
  return new Promise((resolve) => {
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
