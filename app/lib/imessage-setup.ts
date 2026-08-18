import { selectOne } from "./db";
import {
  hashImessageSetupToken,
  normalizeImessageSetupToken,
} from "./imessage-token";

export type ImessageSetup = {
  token_hash: string;
  conversation_hash: string;
  sender_hash: string;
  group_id: string | null;
  expires_at: string;
  consumed_at: string | null;
  created_at: string;
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
