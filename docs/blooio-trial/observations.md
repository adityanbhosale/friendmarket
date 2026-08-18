# Blooio trial observations

Status values are `untested`, `pass`, `fail`, and `blocked`.

| Capability | Status | Observed evidence | Blocker or follow-up |
| --- | --- | --- | --- |
| Trial sender identity and type | untested |  |  |
| Manual add to native iMessage group | untested |  |  |
| Stable native group/chat ID | untested |  |  |
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

## Decision

Current recommendation: **no-go pending trial evidence**.

Final recommendation:

- Decision: pending
- Suitable paid plan: pending
- Required vendor commitments: pending
- Unresolved public-beta blockers: pending
