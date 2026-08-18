import assert from "node:assert/strict";
import test from "node:test";
import {
  INTENT_SCHEMA,
  isAgentInvocation,
  parseDeterministicIntent,
  parseNaturalLanguageIntent,
} from "../src/intent-parser.mjs";

test("invokes only explicit mentions and clear market requests", () => {
  assert.equal(isAgentInvocation("sidebar what are the odds on market 2?"), true);
  assert.equal(isAgentInvocation("put 40 on yes in market 3"), true);
  assert.equal(isAgentInvocation("I bet Dan is late again"), false);
  assert.equal(isAgentInvocation("ordinary group chatter"), false);
});

test("parses natural bet and market query phrases without an LLM", () => {
  assert.deepEqual(
    parseDeterministicIntent("Sidebar, put 40 points on yes in market 3"),
    {
      action: "place_bet",
      marketNumber: 3,
      side: "yes",
      amount: 40,
      question: null,
      criteria: null,
      revealAt: null,
      closeAt: null,
      resolveAt: null,
      confidence: 1,
      clarification: null,
      source: "deterministic",
    },
  );
  assert.equal(
    parseDeterministicIntent("what are the odds on market #7?").action,
    "show_market",
  );
});

test("parses a final-payout request as a market detail read", () => {
  assert.deepEqual(parseDeterministicIntent("show payouts for market 3"), {
    action: "show_market",
    marketNumber: 3,
    side: null,
    amount: null,
    question: null,
    criteria: null,
    revealAt: null,
    closeAt: null,
    resolveAt: null,
    confidence: 1,
    clarification: null,
    source: "deterministic",
  });
});

test("parses a relative-time market creation without an LLM", () => {
  const now = new Date("2026-08-18T20:00:00.000Z");
  const parsed = parseDeterministicIntent(
    "create a market: Will Dan be late? closes in 2 hours",
    { now },
  );
  assert.equal(parsed.action, "create_market");
  assert.equal(parsed.question, "Will Dan be late?");
  assert.equal(parsed.closeAt, "2026-08-18T22:00:00.000Z");
  assert.ok(Date.parse(parsed.revealAt) < Date.parse(parsed.closeAt));
  assert.ok(Date.parse(parsed.closeAt) < Date.parse(parsed.resolveAt));
});

test("does not call OpenAI for ordinary chatter", async () => {
  let called = false;
  const result = await parseNaturalLanguageIntent({
    text: "we should get dinner",
    fetchImpl: async () => {
      called = true;
      throw new Error("unexpected");
    },
  });
  assert.equal(result, null);
  assert.equal(called, false);
});

test("uses strict structured output for ambiguous invoked language", async () => {
  let requestBody;
  const result = await parseNaturalLanguageIntent({
    text: "sidebar I want fifty points on the affirmative side of number four",
    apiKey: "test-key",
    fetchImpl: async (_url, init) => {
      requestBody = JSON.parse(init.body);
      return new Response(
        JSON.stringify({
          output: [
            {
              type: "message",
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify({
                    action: "place_bet",
                    marketNumber: 4,
                    side: "yes",
                    amount: 50,
                    question: null,
                    criteria: null,
                    revealAt: null,
                    closeAt: null,
                    resolveAt: null,
                    confidence: 0.98,
                    clarification: null,
                  }),
                },
              ],
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    },
  });

  assert.equal(requestBody.store, false);
  assert.deepEqual(requestBody.text.format.schema, INTENT_SCHEMA);
  assert.equal(requestBody.text.format.strict, true);
  assert.equal(result.action, "place_bet");
  assert.equal(result.source, "openai");
});

test("returns a clarification when OpenAI fallback is not configured", async () => {
  const result = await parseNaturalLanguageIntent({
    text: "sidebar do the thing with market four",
    apiKey: "",
  });
  assert.equal(result.action, "unknown");
  assert.match(result.clarification, /not configured/i);
});
