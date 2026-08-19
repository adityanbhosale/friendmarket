import assert from "node:assert/strict";
import test from "node:test";
import { derivePhoneIdentity, normalizePhoneNumber } from "../app/lib/phone-identity";

test("phone formatting variants normalize to one identity", () => {
  assert.equal(normalizePhoneNumber("(212) 555-0199"), "+12125550199");
  assert.equal(normalizePhoneNumber("+1 212 555 0199"), "+12125550199");
  assert.equal(normalizePhoneNumber("555"), null);

  const first = derivePhoneIdentity("(212) 555-0199", "test-secret");
  const second = derivePhoneIdentity("+1 212 555 0199", "test-secret");
  assert.deepEqual(first, second);
  assert.match(first!.phoneHash, /^[0-9a-f]{64}$/);
  assert.match(first!.identityCode, /^SB-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  assert.equal(JSON.stringify(first).includes("2125550199"), false);
});
