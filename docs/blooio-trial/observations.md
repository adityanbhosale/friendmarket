# Blooio trial observations

Status values are `untested`, `pass`, `fail`, and `blocked`.

| Capability | Status | Observed evidence | Blocker or follow-up |
| --- | --- | --- | --- |
| Trial sender identity and type | untested |  |  |
| Manual add to native iMessage group | fail | Two tagged messages produced no Blooio event | Requires dedicated Inbound trial or vendor explanation |
| Stable native group/chat ID | untested | Direct chat ID was stable across five control events | Native group still required |
| Individual sender attribution | untested |  |  |
| Participant information | untested |  |  |
| Reply into exact native group | untested |  |  |
| Overlapping-group isolation | untested |  |  |
| Rename stability | untested |  |  |
| Add/remove participant stability | untested |  |  |
| Webhook-subscription replacement | untested |  |  |
| Ordinary chatter delivery behavior | untested |  |  |
| Automatic retry behavior | untested |  |  |
| Manual replay behavior | untested |  |  |
| Duplicate identifiers | untested |  |  |
| Per-group ordering | untested |  |  |
| API-created native group | untested |  |  |
| Trial-to-paid identity continuity | untested |  |  |
| 48-hour completeness and latency | untested |  |  |
| Direct inbound after outbound route | pass | One `message.received` event with a distinct message ID | Cold inbound remains unsupported or unprovisioned on trial |
| Direct lifecycle identifiers | pass | Five unique event IDs; four outbound states shared one message ID, chat ID, and channel ID | Process lifecycle deterministically by event type |
| Webhook signature header | pass | Signature was present on all five Blooio deliveries | Cryptographic verification awaits secure secret injection |

## Run log

### 2026-08-18 — first native-group inbound

- The temporary HTTPS receiver accepted and retained two independent synthetic
  POST requests, including a health check at 14:56:32 ET.
- A tagged message was sent from the native iMessage group after the webhook was
  configured, but no Blooio request reached the receiver.
- Status is blocked rather than failed until a direct-message control and the
  Blooio webhook delivery log distinguish group ingestion from subscription
  configuration.
- The direct-message control also produced no webhook request after three
  receiver checks. This rules out a group-only delivery problem but does not yet
  distinguish failed Blooio ingestion from a webhook subscription problem.
- The direct message and native-group message are also absent from Blooio's own
  Chats/Messages dashboard, while the receiver continues to accept synthetic
  requests. The failure is therefore upstream of webhook delivery: the trial
  identity is not ingesting or routing cold inbound traffic to this organization.
- Blooio's public trial description promises 20 messages and full API access but
  does not explicitly promise a dedicated cold-inbound line. Its Inbound plan
  separately advertises a dedicated number, real-time inbound webhooks, and the
  ability to reply after the user messages first. Purchase is on hold until
  Blooio enables equivalent trial validation or explains the trial routing rule.
- After Blooio sent the first direct message, the recipient's reply appeared in
  Blooio and the webhook. The outbound message produced `queued`, `sent`,
  `delivered`, and `read` lifecycle events; the reply produced one `received`
  event. This is expected lifecycle fan-out, not duplicate message delivery.
- All five deliveries had unique event IDs and signatures. The four outbound
  states shared one message ID, chat ID, and channel ID; the inbound reply used a
  new message ID in the same chat and correctly reversed sender and recipient.
- The observed trial behavior is therefore outbound-first. It still does not
  validate the cold-inbound behavior required from the paid Inbound plan.
- A second tagged message sent in the existing native iMessage group after the
  direct outbound-first route was established produced no Blooio event after
  three receiver checks. Direct messaging works; manually-added native-group
  ingestion does not work on the current trial configuration.
- This fails Sidebar's primary onboarding gate. Do not infer that the paid
  Inbound line works until Blooio demonstrates the exact add-to-existing-group
  flow on a dedicated Inbound-equivalent trial line.

## Decision

Current recommendation: **no-go on the current trial configuration; do not
purchase until Blooio demonstrates cold inbound and existing native-group
ingestion on the exact Inbound configuration**.

Final recommendation:

- Decision: pending
- Suitable paid plan: pending
- Required vendor commitments: pending
- Unresolved public-beta blockers: pending
