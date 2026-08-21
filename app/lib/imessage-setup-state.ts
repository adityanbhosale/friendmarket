export type CompletedImessageSetupBinding = {
  conversationHash: string;
  senderHash: string;
  groupId: string;
  userId: string;
};

/**
 * A consumed setup URL is only a success page for the session it just made.
 * This is authorization for presentation only; the normal session and group
 * membership checks still authorize every application action.
 */
export function completedSetupMatchesBinding(
  setup: { conversation_hash: string; sender_hash: string },
  binding: CompletedImessageSetupBinding,
): boolean {
  return (
    setup.conversation_hash === binding.conversationHash &&
    setup.sender_hash === binding.senderHash &&
    Boolean(binding.groupId) &&
    Boolean(binding.userId)
  );
}
