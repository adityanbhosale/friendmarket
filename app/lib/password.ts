// Group password hashing.
//
// scrypt from node:crypto — memory-hard, in the standard library, and therefore
// no new dependency. Format is self-describing so the cost parameters can be
// raised later without invalidating existing hashes:
//
//   scrypt$<N>$<r>$<p>$<salt-base64>$<hash-base64>

import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

// ~16 MB of memory per hash at N=16384, r=8. Comfortably slow for an attacker
// grinding a shared password, imperceptible on a single join.
const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 64;
const SALT_BYTES = 16;

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // maxmem must be raised above the 32 MB default to admit N=16384, r=8.
    scrypt(
      password.normalize("NFKC"),
      salt,
      KEYLEN,
      { N, r: R, p: P, maxmem: 64 * 1024 * 1024 },
      (err, key) => (err ? reject(err) : resolve(key)),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await derive(password, salt);
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`;
}

/**
 * Constant-time verification. Returns false on any malformed stored value
 * rather than throwing, so a corrupt row cannot be told apart from a wrong
 * password by timing or by error text.
 */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  try {
    const parts = stored.split("$");
    if (parts.length !== 6 || parts[0] !== "scrypt") return false;

    const [, n, r, p, saltB64, hashB64] = parts;
    const salt = Buffer.from(saltB64, "base64");
    const expected = Buffer.from(hashB64, "base64");

    // Pin the digest length rather than deriving at whatever length the stored
    // value happens to be. scrypt output is prefix-stable, so a short stored
    // hash would otherwise still match — and a hash truncated to one byte would
    // accept a random password once every 256 tries.
    if (expected.length !== KEYLEN) return false;

    const key = await new Promise<Buffer>((resolve, reject) => {
      scrypt(
        password.normalize("NFKC"),
        salt,
        KEYLEN,
        { N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024 },
        (err, out) => (err ? reject(err) : resolve(out)),
      );
    });

    // Lengths must match before timingSafeEqual, which throws otherwise.
    if (key.length !== expected.length) return false;
    return timingSafeEqual(key, expected);
  } catch {
    return false;
  }
}
