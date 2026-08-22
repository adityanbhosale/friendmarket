import assert from "node:assert/strict";
import test from "node:test";
import { createReplyCircuitBreaker } from "../src/reply-circuit-breaker.mjs";

test("blocks rapid identical replies and reopens after cooldown", () => {
  let time = 1_000;
  const breaker = createReplyCircuitBreaker({
    now: () => time,
    identicalCooldownMs: 10_000,
  });

  assert.equal(breaker.allow("ACK G1-01"), true);
  assert.equal(breaker.allow("ACK G1-01"), false);
  assert.equal(breaker.allow("ACK G1-02"), true);
  time += 10_001;
  assert.equal(breaker.allow("ACK G1-01"), true);
});

test("caps total replies inside the safety window", () => {
  const breaker = createReplyCircuitBreaker({ maxReplies: 2 });
  assert.equal(breaker.allow("first"), true);
  assert.equal(breaker.allow("second"), true);
  assert.equal(breaker.allow("third"), false);
});

test("accepts or rejects a multi-bubble reply atomically", () => {
  const breaker = createReplyCircuitBreaker({ maxReplies: 3 });
  assert.equal(breaker.allowMany(["one", "two"]), true);
  assert.equal(breaker.allowMany(["three", "four"]), false);
  assert.equal(breaker.allow("three"), true);
});
