# Sidebar local iMessage transport proof

This isolated experiment tests the native iMessage group behavior that the
Blooio free trial could not validate. It uses Photon's open-source
`@photon-ai/imessage-kit` against the Messages database on this Mac.

The transport probe remains isolated, but this directory now also contains a
local Sidebar agent. The agent reads and writes through the same Supabase views
and atomic RPCs as the web app. The Mac only needs to remain online while this
proof is running; this is not the intended production architecture.

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
fingerprints and message bodies are not persisted. Dry-run commands are recorded
as `would_reply`; no message is sent.

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

## Run the Sidebar agent

The local agent currently supports the functionality already present in the
Sidebar backend:

- create and list markets;
- show status, odds, stakes, total pot, and time remaining;
- place a Yes or No bet;
- resolve a market as Yes, No, or Void; and
- show the resulting payouts.

Market-specific membership, market deletion, and random adjudicator selection
are not in the current database model. The agent says so instead of pretending
to perform them. Native iMessage group membership is never changed.

### 1. Bind one iMessage group to one Sidebar group

Bindings are explicit for the proof of concept. This prevents an iMessage
sender or conversation from selecting arbitrary Sidebar UUIDs in a message.

Use `npm run smoke` or `.local/evidence.jsonl` to obtain the 12-character
conversation and sender hashes. In the Supabase SQL editor, use this read-only
query to find the matching Sidebar group and member UUIDs:

```sql
select g.id as group_id, g.name as group_name,
       u.id as user_id, u.name as user_name
from groups g
join group_members gm on gm.group_id = g.id
join users u on u.id = gm.user_id
order by g.name, u.name;
```

Put the resulting values in the root `.env.local`, which is gitignored:

```dotenv
SIDEBAR_IMESSAGE_CONVERSATION_HASH=a26cb18099e4
SIDEBAR_GROUP_ID=00000000-0000-4000-8000-000000000000
SIDEBAR_IMESSAGE_USER_MAP={"34023a9ca954":"11111111-1111-4111-8111-111111111111"}
SIDEBAR_GROUP_TIMEZONE=America/New_York
```

Each sender hash maps to an existing member UUID. Add another JSON property for
each friend who should be able to act. Multiple groups can instead use the
`SIDEBAR_IMESSAGE_BINDINGS` JSON-array form documented in the root
`.env.example`.

### 2. Natural-language interpretation

Common phrasing is parsed locally and costs nothing:

```text
Sidebar, show markets
Sidebar, what are the odds on market 3?
Sidebar, put 40 points on yes in market 3
Sidebar, create a market: Will Dan be late? closes in 2 hours
Sidebar, resolve market 3 as yes
```

Every request must begin with `Sidebar`, `@Sidebar`, or `Hey Sidebar`. Even an
otherwise clear market instruction is ignored without that prefix, so ordinary
group conversation cannot accidentally invoke parsing, an API call, or a
database action.

An OpenAI model is an optional fallback only for explicit Sidebar requests that
the local parser cannot understand. To enable it, set `OPENAI_API_KEY` in the
root `.env.local` or export it in the launching shell. Do not put a key in this
repository or a chat message. `OPENAI_INTENT_MODEL` defaults to
`gpt-5.4-nano`. Ordinary group chatter is discarded before any API call, and
the model returns a strict structured intent; application validation and
Supabase RPCs remain the authority for every mutation.

### 3. Verify without writes, then run

Keep Messages open and run this from the experiment directory in a Terminal
with Full Disk Access:

```zsh
npm test
npm run agent:dry
```

In dry-run mode, reads are real but create/bet/resolve operations only reply
with what they would do. After checking the correct group and sender mapping:

```zsh
npm run agent
```

Stop with Control-C. The process logs only redacted event, conversation, and
sender hashes—not message bodies or credentials.

This local binding is suitable for validating the product loop, not a public
beta. A hosted transport and a database-backed identity-linking flow are still
required before removing the Mac dependency.
