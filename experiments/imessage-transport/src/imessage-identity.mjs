import { createHash, createHmac, randomBytes } from "node:crypto";

export function createImessageIdentityHasher(secret) {
  if (typeof secret !== "string" || secret.length < 32) {
    throw new Error("SIDEBAR_IMESSAGE_ID_SECRET must contain at least 32 characters.");
  }
  return function hashIdentifier(kind, value) {
    if (!new Set(["conversation", "sender"]).has(kind) || !value) {
      throw new Error("Cannot hash an empty or unsupported iMessage identifier.");
    }
    return createHmac("sha256", secret)
      .update(`${kind}\0${String(value)}`)
      .digest("hex");
  };
}

export function generateImessageSetupToken() {
  const token = randomBytes(32).toString("base64url");
  return {
    token,
    tokenHash: createHash("sha256").update(token).digest("hex"),
  };
}
