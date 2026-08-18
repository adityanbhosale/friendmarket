# Blooio transport trial

This trial validates whether Blooio can carry Sidebar traffic in a native
iMessage group. It does not connect Blooio to the Sidebar market database and
does not test market accounting.

## Credential handling

Keep Blooio credentials in the current terminal process. Do not paste them into
chat, commands that contain literal secrets, screenshots, logs, or repository
files.

```zsh
read -s "BLOOIO_API_KEY?Blooio API key: "
export BLOOIO_API_KEY
echo
```

If Blooio issues a webhook signing secret, store it separately:

```zsh
read -s "BLOOIO_WEBHOOK_SECRET?Webhook signing secret: "
export BLOOIO_WEBHOOK_SECRET
echo
```

Remove both variables when the test session ends:

```zsh
unset BLOOIO_API_KEY BLOOIO_WEBHOOK_SECRET
```

The temporary webhook URL is operational data and must not be committed. Insert
it in the Blooio dashboard or API directly from the current trial session.

## Test topology

- `A`, `B`, and `C` are distinct iMessage identities.
- `DM-A` is a direct conversation between A and the Blooio identity.
- `G1` contains A, B, and the Blooio identity.
- `G2` contains A, C, and the same Blooio identity.
- Every message begins with a unique correlation tag such as `G1-A-03`.
- Phone numbers and email addresses are recorded only as A, B, C, and BOT.

The native iMessage group maps to the future Sidebar group. A market remains a
separate application object; adding someone to a market must not change native
iMessage membership.

## Execution sequence

### 1. Trial inventory

Record the trial expiration, sender identity, channel ID, API version, number
type, and advertised plan. Confirm whether the sender is shared or dedicated
and whether an upgrade preserves it.

### 2. Direct baseline

1. A sends `DM-A-01 start`.
2. Confirm one inbound webhook and record all available fields.
3. Reply through Blooio with `ACK DM-A-01`.
4. Repeat for `DM-A-02` through `DM-A-05`.
5. Submit one reply twice with the same idempotency key. Only one iMessage may
   appear.

### 3. Native group and sender attribution

1. Create G1 manually in Messages and add the Blooio identity.
2. A sends `G1-A-01 start`; B sends `G1-B-01 odds`.
3. Require the same group/chat ID and different, correct sender identities.
4. Reply with `ACK G1-A-01` and `ACK G1-B-01` to that exact group.
5. Send the realistic command shapes below, acknowledging rather than executing
   them:

```text
G1-A-02 create "Will Dan black out tonight?" closes 11:30pm
G1-B-02 add Brent to market 1
G1-A-03 bet 1 yes 100
G1-B-03 odds 1
G1-A-04 time 1
G1-B-04 adjudicator 1
G1-A-05 resolve 1 yes
```

Then send ten ordinary messages and one explicit BOT mention. Record whether
Blooio delivers all chatter or filters it.

### 4. Overlapping groups

Create G2, then interleave ten tagged messages between G1 and G2. Require two
stable group IDs, correct senders, and zero replies delivered to the wrong
group. Participant lists are not valid group identifiers.

### 5. Group mutations

Rename G1, add C, send a message from C, remove C, and replace the webhook
subscription. The original group/chat ID must remain stable or Blooio must emit
an explicit replacement relationship. Compare the observed member list with
the group-members API.

### 6. Failure and replay

Temporarily change the receiver path from the normal URL to the same URL with
`/503` appended. Send three tagged messages across G1 and G2. Record delivery
attempts and retry timing, restore the normal URL, and replay failed deliveries.
Replayed events must retain stable event and message identifiers.

### 7. API-created group

If `POST /v4/groups` is enabled for the trial channel, create one group with two
testers. Record success or the exact status/error without upgrading. Verify that
the result is a native iMessage group with group and chat IDs and supports an
exact-group reply.

### 8. Soak

Over 48 hours, send 100 tagged inbound messages and 50 paired replies across G1
and G2. Include a short concurrent burst from all three testers. Do not send
long runs of unprompted bot messages.

## Acceptance gates

- 100/100 tagged inbound messages received.
- Correct sender on every inbound message.
- 50/50 replies delivered to the intended group.
- Zero cross-group deliveries or ID collisions.
- Group identity survives rename, membership changes, webhook replacement, and
  48 hours.
- Failed deliveries are recoverable and duplicates have stable dedupe IDs.
- Per-group message order has no unexplained inversions.
- Inbound-to-webhook p95 is at most 5 seconds.
- API-to-device p95 is at most 10 seconds, with no unexplained result over 30
  seconds.
- Blooio answers the production-limit questions in `vendor-questions.md` in
  writing.

Passing the functional gates permits a paid private pilot. A public beta also
requires the soak to pass and written confirmation of per-line throughput and
additional-line provisioning. Any wrong-group delivery, unstable/unlinkable
group identity, missing sender attribution, or unrecoverable message is a
no-go.
