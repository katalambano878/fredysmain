# SUPABASE → POSTGRES DATABASE REPORT — Frebys

## Shape
**A — Shimmed.** `@supabase/supabase-js` talks to app-origin shims; server uses in-process `pg` compat when `DATABASE_URL` is set.

## Feature matrix

| Supabase feature | PostgreSQL replacement | Status |
|------------------|------------------------|--------|
| PostgREST | `/rest/v1` + `supabase-compat` | Done |
| Auth / GoTrue | `/auth/v1` + `auth.users` + JWT | Done (minimal) |
| Storage buckets | Disk `STORAGE_ROOT` + `/storage/v1` | Done (no `storage` schema) |
| RLS | App-layer auth (`requireAdminSession`, ownership) | Partial → app enforced |
| RPC | Real Postgres functions via `rpc()` | Done |
| Realtime | Unused | N/A |
| Edge functions | Next.js API routes | Done |

## Env cutover
`DATABASE_URL` + `NEXT_PUBLIC_USE_PLAIN_PG=true` + `NEXT_PUBLIC_SUPABASE_URL=<app origin>`

## Remaining intentional Supabase surface
- Package `@supabase/supabase-js` (client API shape)
- Historical SQL/RLS scripts under `scripts/apply-rls*.mjs` (not used at runtime)

## Do not confuse databases
MCP `user-mamator` → Mamator hosted Supabase.  
Frebys production → `fleet-postgres` / database **`frebys`**.
