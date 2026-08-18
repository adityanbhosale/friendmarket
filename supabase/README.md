# Backend setup

## 1. Run the migrations

Open the [SQL editor](https://supabase.com/dashboard/project/xypgxucskpxsgceumywn/sql/new)
and run these in order:

| File | What it does |
| ---- | ------------ |
| `001_auth_and_rls.sql` | Revokes anon access, enables RLS, group passwords, signups, join throttling |
| `002_markets_and_points.sql` | Points ledger, market lifecycle, `place_stake` / `resolve_market` / `open_market` |
| `003_market_kind.sql` | `open_market` writes `kind = 'native'` (`markets_kind_check` rejects anything else) |
| `004_void_reasons.sql` | Void reasons constrained to `empty_side` / `ambiguous` |
| `005_resolve_after_close.sql` | Nothing settles — including voiding — before `close_at` |

003 through 005 are fix-forward patches found by testing against the live
database; 002 has been kept in step with them, so a from-scratch run is correct
either way.

Until 001 runs:

- every table is readable by anyone holding the publishable key
- `groups.password_hash`, `signups`, and `join_attempts` do not exist, so joining
  and the waitlist both fail

Verify afterwards — this should return **zero rows**:

```sql
select table_name, privilege_type
from information_schema.role_table_grants
where grantee in ('anon','authenticated') and table_schema = 'public';
```

And this should return `401`, not `200`:

```
curl -s -o /dev/null -w '%{http_code}\n' \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" \
  "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/users?select=id&limit=1"
```

## 2. Rotate the secret key

`SUPABASE_SECRET_KEY` in `.env.local` was pasted into a chat transcript.
Dashboard → Settings → API Keys → reissue, then update `.env.local`.

## 3. Open a group

No UI for this — opening a group is an operator action.

```
node --env-file=.env.local scripts/create-group.mjs "Moab 2026" moab-2026 "some password"
```

Prints the join URL. Share `/join/<link-id>` and the password separately.

## Architecture

There is no Supabase Auth. `users.id` is a plain `gen_random_uuid()` with no
link to `auth.users`, so there is no `auth.uid()` for a policy to key on, and a
browser holding the publishable key is anonymous by construction — no policy can
distinguish a member from a stranger.

So: **anon is denied everything, and all access runs server-side under the
secret key.** Authorization lives in `app/lib/auth.ts`, not in SQL. The rule
that makes this sound is that the browser never talks to PostgREST.

| Concern        | Where                                    |
| -------------- | ---------------------------------------- |
| DB access      | `app/lib/db.ts` (server-only)            |
| Group password | `app/lib/password.ts` (scrypt)           |
| Sessions       | `app/lib/session-token.ts` + `session.ts`|
| Authorization  | `app/lib/auth.ts`                        |
| Join / sign-out| `app/lib/actions.ts`                     |
