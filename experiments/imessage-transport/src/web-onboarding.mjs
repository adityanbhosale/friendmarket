import { createHmac } from "node:crypto";

const WEB_START = /^\s*@sidebar\s*,?\s*start\s+([A-HJ-NP-Z2-9]{4})\s*-?\s*([A-HJ-NP-Z2-9]{4})\s*$/i;
const GROUP_RECOVERY = /^\s*@sidebar(?:\s+(?:groups?|group\s+codes?|recover))?\s*[.!?]*\s*$/i;

export function parseWebStartRequest(text) {
  const match = String(text ?? "").match(WEB_START);
  return match ? `${match[1]}-${match[2]}`.toUpperCase() : null;
}

export function isGroupRecoveryRequest(text) {
  return GROUP_RECOVERY.test(String(text ?? ""));
}

export function normalizePhoneNumber(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length < 8 || digits.length > 15) return null;
  return `+${digits}`;
}

export function deriveRegisteredPhoneHash(value, secret) {
  const normalized = normalizePhoneNumber(value);
  if (!normalized) return null;
  if (!secret) throw new Error("Missing SESSION_SECRET for iMessage onboarding.");
  return createHmac("sha256", secret)
    .update(`sidebar-phone-identity\0${normalized}`)
    .digest("hex");
}

export function createDirectOnboardingHandler({
  client,
  hashIdentity,
  sessionSecret,
  send,
  now = () => new Date(),
  appUrl = "https://www.trysidebar.xyz",
  dryRun = false,
}) {
  return async function handleDirectOnboarding(message) {
    const destination = message.chatId || message.participant;
    const registeredPhoneHash = deriveRegisteredPhoneHash(
      message.participant,
      sessionSecret,
    );
    if (isGroupRecoveryRequest(message.text)) {
      if (!destination || !message.participant || !registeredPhoneHash) {
        await send({
          to: destination || message.participant,
          text: "I couldn't verify this iMessage as a registered Sidebar phone number.",
        });
        return true;
      }
      if (dryRun) return true;
      try {
        const groups = await client.listGroupsForPhone(registeredPhoneHash);
        await send({
          to: destination,
          text: formatGroupRecovery(groups, appUrl),
        });
      } catch (error) {
        await send({
          to: destination,
          text: `I couldn't recover your Sidebar groups: ${safeMessage(error)}`,
        });
      }
      return true;
    }

    const groupLinkId = parseWebStartRequest(message.text);
    if (!groupLinkId) return false;

    if (!destination || !message.participant || !registeredPhoneHash) {
      await send({
        to: destination || message.participant,
        text: "I couldn't verify this iMessage as the phone number registered with Sidebar. Start the conversation from that number and try again.",
      });
      return true;
    }

    if (dryRun) return true;

    try {
      const staged = await client.stageImessageWebLink({
        senderHash: hashIdentity("sender", message.participant),
        groupLinkId,
        phoneHash: registeredPhoneHash,
        expiresAt: new Date(now().getTime() + 24 * 60 * 60_000).toISOString(),
      });
      await send({
        to: destination,
        text: `You're all set for ${staged.groupName}. Add me to the iMessage group chat, then send “@sidebar help” there.`,
      });
    } catch (error) {
      await send({
        to: destination,
        text: `I couldn't connect that group: ${safeMessage(error)}`,
      });
    }
    return true;
  };
}

function formatGroupRecovery(groups, appUrl) {
  if (!groups.length) {
    return "I couldn't find a Sidebar group registered to this iMessage phone number. If you joined with another number, use that number or your recovery code on the website.";
  }
  const base = String(appUrl || "https://www.trysidebar.xyz").replace(/\/$/, "");
  const lines = groups.slice(0, 10).map(
    (group) => `${group.groupName}: ${group.groupCode}\n${base}/join/${group.groupCode}`,
  );
  return [
    groups.length === 1 ? "Your Sidebar group:" : "Your Sidebar groups:",
    ...lines,
    "The shared group password is not included.",
  ].join("\n\n");
}

function safeMessage(error) {
  const publicMessage = error?.publicMessage;
  if (typeof publicMessage === "string" && publicMessage.length <= 240) {
    return publicMessage;
  }
  return "check the group code and make sure this iMessage number matches the phone number on your Sidebar membership.";
}
