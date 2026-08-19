# Sidebar

Sidebar is a private, points-only prediction market for bets a friend group was
already making. Members create binary markets, stake from a 1,000-point starting
balance, and split each winning pool proportionally.

The private-beta product is the native group flow under `/start`, `/join`, and
`/group`. The older Polymarket-backed `/slates` prototype remains reachable by
direct URL but is not linked from the beta navigation or rulebook.

## Local setup

Requirements: Node.js 24 and a Supabase project.

1. Install dependencies with `npm ci`.
2. Copy `.env.example` to `.env.local` and fill in all required values.
3. Prepare the database:
   - New project: run `supabase/schema.sql` once in the Supabase SQL editor.
   - Existing project: run every not-yet-applied file in `supabase/migrations`
     in numeric order. Never run `schema.sql` over an existing database.
4. Run `npm run dev` and open <http://localhost:3000>.

Creating a group through `/start` creates its owner, phone-derived member code,
membership, starting allocation, session, and recovery code atomically. Raw
phone numbers are normalized in memory and never stored.

Entering an existing group with the same phone number and normalized name
reopens the existing member UUID rather than allocating another identity or
another starting balance. A conflicting phone/name combination is rejected.

## Required environment variables

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project address; the browser does not query it |
| `SUPABASE_SECRET_KEY` | Server-only PostgREST `service_role` credential |
| `SESSION_SECRET` | Stable HMAC key for sessions, rate limits, and private phone identities |

Generate a session secret with `openssl rand -base64 32`.

## Verification

```bash
npm run lint
npm test
npm run build -- --webpack
```

`npm run check` runs the same sequence. Database invariants have a separate
transactional test at `supabase/tests/private_beta_invariants.sql`; run it only
against a disposable or staging database. It rolls back its own data.

## Architecture

- Next.js Server Components render private data per request; Client Components
  submit to authenticated Server Actions.
- `app/lib/db.ts` is the server-only PostgREST data-access layer.
- There is no Supabase Auth. A signed cookie identifies one user in one group,
  and every request rechecks the membership row.
- UUID aliases preserve sessions and recovery codes when a duplicate legacy
  membership is merged into its canonical member.
- Group passwords use scrypt. Personal recovery codes are high-entropy bearer
  credentials stored only as SHA-256 digests.
- Phone numbers become keyed hashes and stable display codes; the raw value is
  not written to Supabase.
- Signed HTTP-only sessions persist for 30 days. Returning to the landing page
  or new-group page with a valid cookie routes the member back to `/group`.
- Postgres RPCs atomically create memberships, join markets, place stakes,
  enforce subject restrictions, and resolve markets.
- Before reveal, SQL views expose only the number of distinct participants.

## Deployment order

For an existing environment, deploy new migrations before the matching app
version. The migrations are backward-compatible with the previous UI: an old UI
may offer settlement too early, but Postgres rejects it. Back up the database and
run the SQL invariant test against staging before production.
