import { createHash } from "node:crypto";

const CORRELATION_TAG = /\b(?:DM|G\d+)-[A-Z0-9]+-\d+\b/i;
const EXPLICIT_TRIGGER = /^\s*(?:@sidebar|sidebar)\b/i;

export function isTaggedTestTraffic(text) {
  return EXPLICIT_TRIGGER.test(text) || CORRELATION_TAG.test(text);
}

export function normalizePhotonMessage(message) {
  return {
    provider: "photon-local",
    eventId: message.id,
    messageId: message.id,
    conversationId: message.chatId,
    isGroup: message.chatKind === "group",
    senderId: message.participant,
    text: message.text ?? "",
    receivedAt: toIsoString(message.createdAt),
    kind: message.kind,
    service: message.service,
    isFromMe: Boolean(message.isFromMe),
  };
}

export function classifyInbound(envelope) {
  if (envelope.isFromMe) return { action: "ignore", reason: "from_me" };
  if (!envelope.isGroup) return { action: "ignore", reason: "not_group" };
  if (envelope.service !== "iMessage") {
    return { action: "ignore", reason: "not_imessage" };
  }
  if (envelope.kind !== "text") return { action: "ignore", reason: "not_text" };
  if (!envelope.conversationId) {
    return { action: "ignore", reason: "missing_conversation_id" };
  }
  if (!envelope.senderId) return { action: "ignore", reason: "missing_sender" };

  const correlationTag = envelope.text.match(CORRELATION_TAG)?.[0]?.toUpperCase();
  if (correlationTag?.includes("-N-")) {
    return { action: "ignore", reason: "ordinary_chatter" };
  }
  if (!EXPLICIT_TRIGGER.test(envelope.text) && !correlationTag) {
    return { action: "ignore", reason: "ordinary_chatter" };
  }

  return {
    action: "reply",
    correlationTag: correlationTag ?? "SIDEBAR",
    replyText: `ACK ${correlationTag ?? "SIDEBAR"}`,
  };
}

export function createMessageProcessor({ sendReply, recordEvidence }) {
  const seenEventIds = new Set();

  return async function processMessage(envelope) {
    if (seenEventIds.has(envelope.eventId)) {
      await recordEvidence(evidenceFor(envelope, "ignored", "duplicate_event"));
      return { action: "ignore", reason: "duplicate_event" };
    }
    seenEventIds.add(envelope.eventId);

    const decision = classifyInbound(envelope);
    if (decision.action === "ignore") {
      await recordEvidence(evidenceFor(envelope, "ignored", decision.reason));
      return decision;
    }

    try {
      await sendReply(envelope.conversationId, decision.replyText);
      await recordEvidence(
        evidenceFor(envelope, "replied", null, decision.correlationTag),
      );
      return decision;
    } catch (error) {
      await recordEvidence(
        evidenceFor(envelope, "failed", errorMessage(error), decision.correlationTag),
      );
      throw error;
    }
  };
}

export function evidenceFor(envelope, result, reason, correlationTag = null) {
  return {
    observedAt: new Date().toISOString(),
    provider: envelope.provider,
    eventHash: fingerprint(envelope.eventId),
    messageHash: fingerprint(envelope.messageId),
    conversationHash: fingerprint(envelope.conversationId),
    senderHash: fingerprint(envelope.senderId),
    isGroup: envelope.isGroup,
    kind: envelope.kind,
    service: envelope.service,
    receivedAt: envelope.receivedAt,
    correlationTag,
    result,
    reason,
  };
}

export function fingerprint(value) {
  if (!value) return null;
  return createHash("sha256").update(String(value)).digest("hex").slice(0, 12);
}

function toIsoString(value) {
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? new Date().toISOString() : parsed.toISOString();
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
