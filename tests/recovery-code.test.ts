import assert from "node:assert/strict";
import test from "node:test";
import {
  generateRecoveryCode,
  hashRecoveryCode,
  normalizeRecoveryCode,
} from "../app/lib/recovery-code";

test("recovery codes are copy-friendly, valid, and unique", () => {
  const codes = new Set(Array.from({ length: 100 }, generateRecoveryCode));
  assert.equal(codes.size, 100);
  for (const code of codes) {
    assert.match(code, /^RCV-[A-HJ-KM-NP-Z2-9]{5}(?:-[A-HJ-KM-NP-Z2-9]{5}){3}$/);
    assert.equal(normalizeRecoveryCode(code)?.length, 20);
  }
});

test("normalization accepts punctuation variants and rejects ambiguous codes", () => {
  const code = "RCV-ABCDE-FGHJK-MNPQR-STUVW";
  const expected = "ABCDEFGHJKMNPQRSTUVW";
  assert.equal(normalizeRecoveryCode(code), expected);
  assert.equal(normalizeRecoveryCode(expected.toLowerCase()), expected);
  assert.equal(normalizeRecoveryCode("RCV-ABCDE-FGH1K-MNPQR-STUVW"), null);
  assert.equal(normalizeRecoveryCode("too-short"), null);
});

test("hashing is deterministic and does not retain the code", () => {
  const normalized = "ABCDEFGHJKMNPQRSTUVW";
  const digest = hashRecoveryCode(normalized);
  assert.equal(digest, hashRecoveryCode(normalized));
  assert.match(digest, /^[a-f0-9]{64}$/);
  assert.ok(!digest.includes(normalized));
});
