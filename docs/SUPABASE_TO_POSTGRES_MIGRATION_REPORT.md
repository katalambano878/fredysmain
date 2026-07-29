# SUPABASE → POSTGRES MIGRATION REPORT — Frebys

## Shape
**A — Shimmed.** Browser and many admin screens still use `@supabase/supabase-js` against the **app origin**; server admin uses in-process compat when `DATABASE_URL` is set.

## Feature matrix

| Supabase feature | Replacement | Status |
|------------------|-------------|---------|
| PostgREST | `app/rest/v1` + `lib/db/supabase-compat` | Done |
| Auth (GoTrue) | `app/auth/v1` + `lib/db/auth` | Done |
| Storage | Disk `STORAGE_ROOT` + `app/storage/v1` | Done |
| RLS | App-layer auth (`requireAdminSession`, ownership filters) | Partial → improved Jul 2026 |
| RPC | Postgres functions via `/rest/v1/rpc` | Done (must exist in DB) |
| Realtime | Not used | N/A |
| Edge functions | Next.js API routes | Done |

## Env cutover trio
`DATABASE_URL` + `NEXT_PUBLIC_USE_PLAIN_PG=true` + `NEXT_PUBLIC_SUPABASE_URL=<app origin>`

## Remaining Supabase surface
- Runtime dependency on `@supabase/supabase-js` (intentional for Shape A).
- Obsolete scripts under `scripts/apply-rls*.mjs` (hosted URLs) — not used in production runtime.
- `ignoreBuildErrors: true` still on for Coolify builds.

## Data integrity notes
- Order create now server-prices from `products` / `product_variants`.
- Order lookup requires email match.
- Admin mark-paid prefers `mark_order_paid` RPC.

See also: `docs/SUPABASE_TO_POSTGRES_MIGRATION_GUIDE.md`.
