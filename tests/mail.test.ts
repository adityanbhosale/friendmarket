import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { groupCodeMail } from "../app/lib/mail";

describe("groupCodeMail", () => {
  it("contains the group code and link without recovery credentials", () => {
    const mail = groupCodeMail({
      groupName: "Monkey Business",
      linkId: "K7QM-3XPD",
      memberName: "Yash",
    });

    assert.match(mail.subject, /K7QM-3XPD/);
    assert.match(mail.text, /https:\/\/www\.trysidebar\.xyz\/join\/K7QM-3XPD/);
    assert.doesNotMatch(mail.text, /recovery code/i);
    assert.equal(mail.text.includes("SB-SECRET"), false);
  });

  it("escapes member-controlled HTML", () => {
    const mail = groupCodeMail({
      groupName: "<script>alert(1)</script>",
      linkId: "K7QM-3XPD",
      memberName: "<b>Yash</b>",
    });

    assert.equal(mail.html.includes("<script>"), false);
    assert.equal(mail.html.includes("<b>Yash</b>"), false);
    assert.match(mail.html, /&lt;b&gt;Yash&lt;\/b&gt;/);
  });
});
