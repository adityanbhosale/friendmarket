import { createHash, randomInt } from "node:crypto";

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const BODY_LENGTH = 20;

/** Generates a copy-friendly bearer credential with roughly 100 bits of entropy. */
export function generateRecoveryCode(): string {
  const body = Array.from(
    { length: BODY_LENGTH },
    () => ALPHABET[randomInt(ALPHABET.length)],
  ).join("");
  return `RCV-${body.match(/.{5}/g)!.join("-")}`;
}

/** Accepts codes with or without the display punctuation. */
export function normalizeRecoveryCode(value: string): string | null {
  let compact = value.trim().toUpperCase().replace(/[\s-]/g, "");
  if (compact.startsWith("RCV")) compact = compact.slice(3);

  if (compact.length !== BODY_LENGTH) return null;
  if (![...compact].every((char) => ALPHABET.includes(char))) return null;
  return compact;
}

/** The code has high entropy, so an unsalted one-way digest is sufficient. */
export function hashRecoveryCode(normalizedCode: string): string {
  return createHash("sha256").update(normalizedCode).digest("hex");
}
