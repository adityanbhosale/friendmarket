import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_SIDEBAR_IMESSAGE_NUMBER,
  formatSidebarImessageNumber,
  normalizeSidebarImessageNumber,
  sidebarImessageNumber,
  sidebarSmsHref,
} from "../app/lib/imessage-number";

test("the production iMessage number is the safe default", () => {
  assert.equal(DEFAULT_SIDEBAR_IMESSAGE_NUMBER, "+14842528904");
  assert.equal(sidebarImessageNumber(undefined), "+14842528904");
  assert.equal(sidebarImessageNumber("not-a-phone-number"), "+14842528904");
});

test("a valid E.164 deployment override is preserved", () => {
  assert.equal(
    normalizeSidebarImessageNumber("  +14842528904  "),
    "+14842528904",
  );
  assert.equal(sidebarImessageNumber("+12125550199"), "+12125550199");
});

test("the Sidebar number is readable in onboarding copy", () => {
  assert.equal(
    formatSidebarImessageNumber("+14842528904"),
    "+1 (484) 252-8904",
  );
  assert.equal(sidebarSmsHref("+14842528904"), "sms:+14842528904");
});
