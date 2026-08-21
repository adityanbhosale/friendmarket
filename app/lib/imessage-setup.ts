import { selectOne } from "./db";
import {
  hashImessageSetupToken,
  normalizeImessageSetupToken,
} from "./imessage-token";
import { completedSetupMatchesBinding } from "./imessage-setup-state";

export type ImessageSetup = {
  token_hash: string;
  conversation_hash: string;
  sender_hash: string;
  group_id: string | null;
  expires_at: string;
  consumed_at: string | null;
  created_at: string;
};

type ImessageConversation = {
  conversation_hash: string;
  group_id: string;
};

type ImessageIdentity = {
  conversation_hash: string;
  sender_hash: string;
  user_id: string;
};

export async function getLiveImessageSetup(rawToken: unknown) {
  const token = normalizeImessageSetupToken(rawToken);
  if (!token) return null;
  const setup = await selectOne<ImessageSetup>("imessage_setup_tokens", {
    token_hash: `eq.${hashImessageSetupToken(token)}`,
    consumed_at: "is.null",
    expires_at: `gt.${new Date().toISOString()}`,
  });
  return setup ? { token, setup } : null;
}

/**
 * Recovers the setup row during the one response that consumes it.
 *
 * Creating a session mutates a cookie, so Next.js re-renders the setup route
 * in the same Server Action response. By then the one-time token is consumed.
 * Treating every consumed token as usable would reopen old links, so require
 * the resulting conversation and sender bindings to match the new session.
 */
export async function getCompletedImessageSetup(
  rawToken: unknown,
  membership: { groupId: string; userId: string },
) {
  const token = normalizeImessageSetupToken(rawToken);
  if (!token) return null;

  const setup = await selectOne<ImessageSetup>("imessage_setup_tokens", {
    token_hash: `eq.${hashImessageSetupToken(token)}`,
    consumed_at: "not.is.null",
  });
  if (!setup) return null;

  const [conversation, identity] = await Promise.all([
    selectOne<ImessageConversation>("imessage_conversations", {
      conversation_hash: `eq.${setup.conversation_hash}`,
      group_id: `eq.${membership.groupId}`,
    }),
    selectOne<ImessageIdentity>("imessage_identities", {
      conversation_hash: `eq.${setup.conversation_hash}`,
      sender_hash: `eq.${setup.sender_hash}`,
      user_id: `eq.${membership.userId}`,
    }),
  ]);

  if (
    !conversation ||
    !identity ||
    !completedSetupMatchesBinding(setup, {
      conversationHash: conversation.conversation_hash,
      senderHash: identity.sender_hash,
      groupId: conversation.group_id,
      userId: identity.user_id,
    })
  ) {
    return null;
  }

  return { token, setup };
}
