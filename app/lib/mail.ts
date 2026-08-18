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
 * The registration mail. Carries the group ID, because that is the thing
 * people lose, and the two links they will want later.
 *
 * It does NOT carry the group password. The password is the other half of the
 * credential, and mail is the least private place either half could sit — an
 * inbox is forwarded, synced, and searched. Anyone holding both halves is in
 * the group. Sending one is a convenience; sending both would post the keys
 * through the letterbox.
 */
export function registrationMail(args: {
  groupName: string;
  linkId: string;
  adminName: string;
}): Mail {
  const { groupName, linkId, adminName } = args;
  const joinUrl = `${SITE_URL}/join/${linkId}`;
  const adminUrl = `${SITE_URL}/group/admin`;

  const text = [
    `${groupName} is open.`,
    ``,
    `Group ID: ${linkId}`,
    ``,
    `That ID is how people get in, and it is not recoverable from anywhere`,
    `else — we do not list groups by name. Keep this email.`,
    ``,
    `Invite link:  ${joinUrl}`,
    `Admin view:   ${adminUrl}`,
    ``,
    `Anyone joining needs the ID and the group password. The password is not`,
    `in this email and never will be — send it to your group some other way.`,
    ``,
    `You are the admin of ${groupName}, which means the admin view is yours:`,
    `who has joined, what markets are open, and what still needs resolving.`,
    ``,
    `— Sidebar. Points only.`,
  ].join("\n");

  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#ffffff;color:#111111;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;line-height:1.55">
  <div style="max-width:520px;margin:0 auto">
    <p style="margin:0 0 24px;font-size:20px;font-weight:500;letter-spacing:-0.02em">${esc(groupName)} is open.</p>

    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-top:1px solid #111111;border-bottom:1px solid #111111;margin:0 0 20px">
      <tr>
        <td style="padding:14px 0;font-size:12px;color:#666666">Group ID</td>
        <td style="padding:14px 0;text-align:right;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:18px;letter-spacing:0.06em">${esc(linkId)}</td>
      </tr>
    </table>

    <p style="margin:0 0 20px;color:#666666;font-size:14px">
      That ID is how people get in, and it is not recoverable from anywhere else &mdash;
      we don&rsquo;t list groups by name. Keep this email.
    </p>

    <p style="margin:0 0 8px"><a href="${joinUrl}" style="color:#111111">Invite link</a> &middot; <span style="color:#666666;font-size:13px">send this to the group</span></p>
    <p style="margin:0 0 24px"><a href="${adminUrl}" style="color:#111111">Admin view</a> &middot; <span style="color:#666666;font-size:13px">members, markets, what needs resolving</span></p>

    <p style="margin:0 0 24px;color:#666666;font-size:14px">
      Joining takes the ID <em>and</em> the group password. The password isn&rsquo;t in this
      email and never will be &mdash; pass it along some other way.
    </p>

    <p style="margin:0;padding-top:20px;border-top:1px solid #e5e5e5;color:#666666;font-size:13px">
      ${esc(adminName)}, you&rsquo;re the admin of ${esc(groupName)}. Points only &mdash; settle your own Venmo beef.
    </p>
  </div>
</body></html>`;

  return {
    to: "",
    subject: `${groupName} is open — group ID ${linkId}`,
    text,
    html,
  };
}
