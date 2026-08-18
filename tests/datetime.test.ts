import assert from "node:assert/strict";
import test from "node:test";
import { parseLocalDateTime } from "../app/lib/datetime";

test("datetime-local values are converted using the browser offset", () => {
  assert.equal(
    parseLocalDateTime("2026-08-18T10:00", 240),
    "2026-08-18T14:00:00.000Z",
  );
  assert.equal(
    parseLocalDateTime("2026-08-18T10:00:30", -60),
    "2026-08-18T09:00:30.000Z",
  );
});

test("invalid or empty datetime-local values are rejected", () => {
  assert.equal(parseLocalDateTime("", 0), null);
  assert.equal(parseLocalDateTime("August 18", 0), null);
  assert.equal(parseLocalDateTime(null, 0), null);
});
