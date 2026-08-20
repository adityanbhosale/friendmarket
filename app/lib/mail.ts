// Outbound mail, over Resend's HTTP API.
//
// Deliberately no SDK: the whole surface we use is one POST, and a dependency
// here would be a dependency in every serverless cold start for the sake of a
// fetch call.
//
// Nothing in this module throws at the caller. Mail is a courtesy on top of an
// action that has already committed — a group that exists, a market that is
// open — and a provider outage must never turn that into a failed request or a
// rolled-back-looking error on screen. Failures are logged and reported in the
// return value for the caller to ignore or surface as it sees fit.

const RESEND_ENDPOINT = "https://api.resend.com/emails";

const KEY = process.env.RESEND_API_KEY;
const FROM = process.env.MAIL_FROM ?? "Sidebar <sidebar@trysidebar.xyz>";

/** Absolute base for links in mail, where a relative URL is meaningless. */
export const SITE_URL = (
  process.env.SITE_URL ?? "https://www.trysidebar.xyz"
).replace(/\/+$/, "");

export type MailResult =
  | { sent: true }
  | { sent: false; reason: "not_configured" | "rejected" | "error"; detail?: string };

export type Mail = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

export async function sendMail(mail: Mail): Promise<MailResult> {
  if (!KEY) {
    // Local development and any deploy without a key: say so once, loudly
    // enough to find in a log, and carry on.
    console.warn(`[mail] RESEND_API_KEY unset — not sending "${mail.subject}"`);
    return { sent: false, reason: "not_configured" };
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: [mail.to],
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
      }),
      cache: "no-store",
    });

    if (!res.ok) {
      const detail = (await res.text()).slice(0, 500);
      console.error(`[mail] ${res.status} sending "${mail.subject}": ${detail}`);
      return { sent: false, reason: "rejected", detail };
    }

    return { sent: true };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error(`[mail] failed sending "${mail.subject}": ${detail}`);
    return { sent: false, reason: "error", detail };
  }
}

/**
 * Good enough to catch a typo and a pasted sentence, and nothing more. Real
 * address validation is delivery — the provider will tell us, and the person
 * will notice the mail never arrived.
 */
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(value) && value.length <= 254;
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * The one mail Sidebar sends a person: everything they need to get back in,
 * and everything they need to bring someone else in.
 *
 * Sent on opening a group and on first joining one, because both people have
 * exactly the same problem — a group code and a recovery code shown once on a
 * screen they are about to navigate away from.
 *
 * It carries the recovery code. That is a bearer credential and mail is an
 * imperfect place for one, but the alternative is worse in a specific way:
 * only a SHA-256 of the code is ever stored, so there is no mechanism by which
 * it could be sent later. The moment of issue is the only chance to give
 * someone a durable copy, and a code nobody kept is a member locked out of
 * their own points for good.
 *
 * It does NOT carry the group password. That one is shared by the whole group,
 * it is not needed to recover an identity, and mailing it to every joiner
 * would scatter the group's front-door key across as many inboxes as there are
 * members.
 */
export function membershipMail(args: {
  role: "admin" | "member";
  groupName: string;
  linkId: string;
  memberName: string;
  memberId: string;
  recoveryCode: string;
}): Mail {
  const { role, groupName, linkId, memberName, memberId, recoveryCode } = args;
  const isAdmin = role === "admin";
  const joinUrl = `${SITE_URL}/join/${linkId}`;
  const recoverUrl = `${SITE_URL}/recover`;
  const adminUrl = `${SITE_URL}/group/admin`;

  const opening = isAdmin
    ? `${groupName} is open, and you are its admin.`
    : `You are in ${groupName}.`;

  const text = [
    opening,
    ``,
    `Keep this email. Everything below is either impossible or annoying to`,
    `recover, and the recovery code cannot be reissued at all.`,
    ``,
    `GROUP CODE    ${linkId}`,
    `RECOVERY CODE ${recoveryCode}`,
    `YOUR MEMBER ID ${memberId}`,
    ``,
    `The recovery code restores this identity — your points and your stakes —`,
    `on another device or after clearing your browser. We only keep a hash of`,
    `it, so nobody can send it to you again, including us.`,
    `Use it at: ${recoverUrl}`,
    ``,
    `To bring people in, send them:`,
    `  ${joinUrl}`,
    `...and the group password, separately. The password is not in this email`,
    `and never will be.`,
    ...(isAdmin
      ? [``, `Admin view — members, markets, what still needs resolving:`, `  ${adminUrl}`]
      : []),
    ``,
    `— Sidebar. Points only.`,
  ].join("\n");

  const row = (label: string, value: string, mono = true) => `
      <tr>
        <td style="padding:12px 0;font-size:12px;color:#666666;white-space:nowrap;vertical-align:top">${label}</td>
        <td style="padding:12px 0 12px 16px;text-align:right;${
          mono ? "font-family:ui-monospace,SFMono-Regular,Menlo,monospace;" : ""
        }font-size:14px;word-break:break-all">${esc(value)}</td>
      </tr>`;

  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#ffffff;color:#111111;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;line-height:1.55">
  <div style="max-width:560px;margin:0 auto">
    <p style="margin:0 0 8px;font-size:20px;font-weight:500;letter-spacing:-0.02em">${esc(opening)}</p>
    <p style="margin:0 0 24px;color:#666666;font-size:14px">
      Keep this email. The recovery code below cannot be reissued.
    </p>

    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-top:1px solid #111111;border-bottom:1px solid #111111;margin:0 0 24px">
      ${row("Group code", linkId)}
      ${row("Recovery code", recoveryCode)}
      ${row("Your member ID", memberId)}
    </table>

    <p style="margin:0 0 24px;color:#666666;font-size:14px">
      The recovery code restores this identity &mdash; your points and your stakes &mdash;
      on another device or after clearing your browser. We store only a hash of it, so
      nobody can send it to you again, <em>including us</em>.
      <a href="${recoverUrl}" style="color:#111111">Use it here</a>.
    </p>

    <p style="margin:0 0 6px;font-size:14px">To bring people in, send them this link:</p>
    <p style="margin:0 0 20px"><a href="${joinUrl}" style="color:#111111;word-break:break-all">${joinUrl}</a></p>
    <p style="margin:0 0 24px;color:#666666;font-size:14px">
      &hellip;and the group password, separately. The password isn&rsquo;t in this email
      and never will be &mdash; it&rsquo;s the whole group&rsquo;s front door.
    </p>
${
  isAdmin
    ? `    <p style="margin:0 0 24px;font-size:14px">
      <a href="${adminUrl}" style="color:#111111">Admin view</a>
      <span style="color:#666666"> &middot; members, markets, what still needs resolving</span>
    </p>
`
    : ""
}
    <p style="margin:0;padding-top:20px;border-top:1px solid #e5e5e5;color:#666666;font-size:13px">
      ${esc(memberName)} &middot; ${esc(groupName)} &middot; points only, settle your own Venmo beef.
    </p>
  </div>
</body></html>`;

  return {
    to: "",
    subject: isAdmin
      ? `${groupName} is open — group code ${linkId}`
      : `You're in ${groupName} — group code ${linkId}`,
    text,
    html,
  };
}
