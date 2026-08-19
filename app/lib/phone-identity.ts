import { createHmac } from "node:crypto";

export type PhoneIdentity = {
  phoneHash: string;
  identityCode: string;
};

export function normalizePhoneNumber(value: FormDataEntryValue | string | null): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length < 8 || digits.length > 15) return null;
  return `+${digits}`;
}

export function derivePhoneIdentity(
  value: FormDataEntryValue | string | null,
  secret = process.env.SESSION_SECRET,
): PhoneIdentity | null {
  const normalized = normalizePhoneNumber(value);
  if (!normalized) return null;
  if (!secret) throw new Error("Missing SESSION_SECRET for phone identity hashing.");

  const digest = createHmac("sha256", secret)
    .update(`sidebar-phone-identity\0${normalized}`)
    .digest();
  const phoneHash = digest.toString("hex");
  const token = digest.toString("base64url").replace(/[-_]/g, "X").toUpperCase().slice(0, 12);
  return {
    phoneHash,
    identityCode: `SB-${token.slice(0, 4)}-${token.slice(4, 8)}-${token.slice(8, 12)}`,
  };
}
