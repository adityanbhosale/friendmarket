# Supabase backend

The browser never talks to PostgREST. Anonymous and authenticated Supabase roles
have no access; the Next.js server uses `SUPABASE_SECRET_KEY` and performs the
application authorization checks.

## New database

Run `schema.sql` once in an empty Supabase project. It contains the complete
private-beta schema, views, functions, RLS posture, and service-role grants.

Do not run `schema.sql` against a database that already contains Sidebar data.

## Existing database

Apply not-yet-run files from `migrations/` in numeric order:

| File | Change |
| --- | --- |
| `001_auth_and_rls.sql` | Deny anonymous access, group passwords, waitlist, join throttling |
| `002_markets_and_points.sql` | Ledger, sealed pools, market RPCs |
| `003_market_kind.sql` | Correct native-market kind |
| `004_void_reasons.sql` | Constrained void reasons |
| `005_resolve_after_close.sql` | Reject settlement before close |
| `006_private_beta_integrity.sql` | Strict native timing, fully sealed views, reject settlement before `resolve_at` |
| `007_recovery_and_atomic_entry.sql` | Recovery codes and atomic group creation/joining |
| `008_group_admin.sql` | Group administrator/email, backfill, and atomic admin-aware creation |
| `009_seal_totals_in_sql.sql` | Seal legacy aggregate views at the database boundary |
| `010_optional_imessage_links.sql` | Optional iMessage bindings and expiring browser setup links |
| `011`–`015` | Adjudicators, member phone identity, persistent login reuse, and legacy identity repairs |
| `016_web_first_imessage_onboarding.sql` | Verified website-to-iMessage group handoff |

Migration 006 intentionally aborts if existing native markets violate
`reveal_at < close_at < resolve_at`. Repair those rows explicitly before retrying;
do not weaken the constraint.

## Verification

After applying the schema or migrations, run
`tests/private_beta_invariants.sql` against staging. It tests allocations,
transaction rollback, sealed views, early-resolution rejection, and parimutuel
payouts inside a transaction that ends with `ROLLBACK`.

Verify anonymous grants separately; this query must return zero rows:

```sql
select table_name, privilege_type
from information_schema.role_table_grants
where grantee in ('anon', 'authenticated') and table_schema = 'public';
```

Rotate any secret key that has appeared in a transcript or log, then update the
deployment environment before serving traffic.
