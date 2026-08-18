import { createHash } from "node:crypto";

const TOKEN = /^[A-Za-z0-9_-]{43}$/;

export function normalizeImessageSetupToken(value: unknown): string | null {
  const token = String(value ?? "").trim();
  return TOKEN.test(token) ? token : null;
}

export function hashImessageSetupToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
