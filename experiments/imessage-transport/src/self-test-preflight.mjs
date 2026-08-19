import { IMessageSDK } from "@photon-ai/imessage-kit";
import { createSidebarClient } from "./sidebar-client.mjs";
import { loadSelfTestConfig } from "./self-test-routing.mjs";
import { fingerprint } from "./transport-core.mjs";

const missing = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY"].filter(
  (name) => !process.env[name],
);

if (missing.length > 0) {
  write({ status: "configuration_required", missing });
  process.exitCode = 1;
} else {
  await verify();
}

async function verify() {
  let sdk;
  try {
    const config = loadSelfTestConfig(process.env, { requireBinding: true });
    sdk = new IMessageSDK({ maxConcurrentSends: 1 });
    const groups = await sdk.listChats({
      kind: "group",
      service: "iMessage",
      sortBy: "recent",
      limit: 100,
    });
    const conversationFound = groups.some(
      (group) => fingerprint(group.chatId) === config.conversationHash,
    );
    if (!conversationFound) {
      throw new Error("The configured iMessage conversation was not found on this Mac.");
    }

    const client = createSidebarClient();
    await client.requireMembership(config.groupId, config.userId);
    write({
      status: "ready",
      messagesDatabase: true,
      configuredConversationFound: true,
      sidebarMembership: true,
    });
  } catch (error) {
    write({
      status: "failed",
      message: error instanceof Error ? error.message : String(error),
    });
    process.exitCode = 1;
  } finally {
    if (sdk) await sdk.close().catch(() => undefined);
  }
}

function write(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}
