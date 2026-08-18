import assert from "node:assert/strict";
import test from "node:test";
import {
  canResolveAt,
  impliedProbability,
  marketState,
} from "../app/lib/market-rules";

const market = {
  reveal_at: "2026-01-02T00:00:00.000Z",
  close_at: "2026-01-03T00:00:00.000Z",
  resolve_at: "2026-01-04T00:00:00.000Z",
  resolved_at: null,
  void_reason: null,
};

test("market lifecycle is derived from timestamps", () => {
  assert.equal(marketState(market, Date.parse("2026-01-01T00:00:00Z")), "seeding");
  assert.equal(marketState(market, Date.parse("2026-01-02T12:00:00Z")), "open");
  assert.equal(marketState(market, Date.parse("2026-01-03T12:00:00Z")), "closed");
  assert.equal(canResolveAt(market, Date.parse("2026-01-03T12:00:00Z")), false);
  assert.equal(canResolveAt(market, Date.parse("2026-01-04T00:00:00Z")), true);
});

test("resolved and void states override timestamps", () => {
  assert.equal(
    marketState({ ...market, resolved_at: "2026-01-04T01:00:00Z" }, 0),
    "resolved",
  );
  assert.equal(
    marketState(
      { ...market, resolved_at: "2026-01-04T01:00:00Z", void_reason: "ambiguous" },
      0,
    ),
    "void",
  );
});

test("probability remains unavailable while sealed", () => {
  assert.equal(
    impliedProbability(
      [
        { side_id: "yes", pool: null, revealed: false },
        { side_id: "no", pool: null, revealed: false },
      ],
      "yes",
    ),
    null,
  );
  assert.equal(
    impliedProbability(
      [
        { side_id: "yes", pool: 25, revealed: true },
        { side_id: "no", pool: 75, revealed: true },
      ],
      "yes",
    ),
    25,
  );
});
