# Sidebar local iMessage transport proof

This isolated experiment tests the native iMessage group behavior that the
Blooio free trial could not validate. It uses Photon's open-source
`@photon-ai/imessage-kit` against the Messages database on this Mac.

It does not connect to Sidebar, Supabase, an LLM, or production. The Mac only
needs to remain online while this proof is running; this is not the intended
production architecture.

## What it proves

- A manually created native iMessage group produces a stable conversation ID.
- Each inbound group message identifies its individual sender.
- A process can reply into the exact group that produced the message.
- Overlapping groups remain isolated.
- Ordinary chatter does not trigger bot replies.
- Rename, membership, and process-restart behavior can be observed.

## Permissions

No Photon account or credential is used.

The process running the probe needs access to the local Messages database:

1. Open **System Settings → Privacy & Security → Full Disk Access**.
2. Enable Codex or the terminal application that will run this probe.
3. Restart that application.
4. Keep Messages open and signed into iMessage.
5. Approve the macOS Automation prompt for controlling Messages when the first
   reply is sent.

Basic receipt and text replies do not require Photon's hosted service or its
private API.

## Install and verify

From this directory:

```zsh
npm ci
npm test
npm run smoke
```

`smoke` performs a read-only query and prints only hashed conversation IDs. A
successful response has `"status":"ready"` and at least one group.

## Watch safely

Start in dry-run mode so nothing is sent:

```zsh
npm run watch:dry
```

Send these messages from the test group:

```text
ordinary chatter G1-N-01
sidebar G1-A-01 ping
G1-B-01 odds
```

Only the last two should be classified as commands. The watcher discards all
untagged traffic before processing, so unrelated conversations are not recorded.
Evidence is appended to `.local/evidence.jsonl`; identifiers are SHA-256
fingerprints and message bodies are not persisted.

After confirming the correct group and sender hashes, start reply mode:

```zsh
npm run watch
```

The expected replies are `ACK G1-A-01` and `ACK G1-B-01`. Stop with Control-C.

## Test sequence

1. Send one tagged message from two different participants in G1.
2. Create G2 with an overlapping participant and send ten interleaved tags.
3. Confirm G1 and G2 have different `conversationHash` values and no reply
   crosses groups.
4. Rename G1 and send another tag.
5. Add and remove a participant and send after each change.
6. Restart the watcher and confirm the same group hash returns.
7. Send ten ordinary messages and confirm every one is recorded as
   `ordinary_chatter` with no reply.
8. Run 50 tagged inbound messages and 25 replies over several hours.

The proof passes only with complete sender attribution, stable group hashes,
zero cross-group replies, zero chatter replies, and reliable exact-group ACKs.

## Transport boundary

The probe normalizes local Photon messages into a provider-neutral envelope:

```text
provider, eventId, messageId, conversationId, isGroup,
senderId, text, receivedAt, kind, service, isFromMe
```

Only `receiveMessage` and `sendReply(conversationId, text)` behavior should move
into the eventual Sidebar integration. Market state remains deterministic and
provider-independent.
