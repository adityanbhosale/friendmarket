import assert from "node:assert/strict";
import test from "node:test";
import { normalizeGroupCode } from "../app/lib/group-code";

test("group codes normalize case, whitespace, and an optional dash", () => {
  assert.equal(normalizeGroupCode("k7qm3xpd"), "K7QM-3XPD");
  assert.equal(normalizeGroupCode(" K7QM - 3XPD "), "K7QM-3XPD");
});

test("recovery codes and ambiguous group-code characters are rejected", () => {
  assert.equal(normalizeGroupCode("RCV-SKY94-N5E2Q-BZ9EU-SQDJY"), null);
  assert.equal(normalizeGroupCode("ABIO-1001"), null);
});
