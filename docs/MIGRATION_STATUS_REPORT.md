# MIGRATION STATUS REPORT — Frebys

## Tooling
- **Not Prisma/Drizzle** — SQL files in `supabase/migrations/`
- Applied manually (Coolify / `fleet-postgres` as `postgres`)
- App role: `frebys` (DML); DDL typically requires `postgres`

## Repository migrations

| File | Intent | Applied on frebys |
|------|--------|-------------------|
| `20260209000000_complete_schema.sql` | Baseline ecommerce schema | Yes (historical) |
| `20260417*` homepage gallery / finance COP | Yes | |
| `20260423000000_preorder.sql` | Preorder flags | Yes |
| `20260505000000_cop_per_variant.sql` | COP per variant | Yes |
| `20260601000000_product_gender.sql` | Gender column | Yes |
| `20260627000000_gallery_preorders.sql` | Gallery preorders | Yes |
| **`20260802000000_payment_integrity.sql`** | Payment attempts, callbacks, SMS logs, indexes, mark_order_paid | **Yes (2026-08-02)** |

## Corrective migration notes
- Additive only: CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS, CREATE OR REPLACE FUNCTION
- No DROP TABLE / no data deletes
- Rollback: drop new tables + restore prior function defs from backup (see recovery guide)

## Deployment order
1. Apply SQL as `postgres` on `frebys`
2. `GRANT` to `frebys` (`scripts/vps-grant-frebys.sh`)
3. Deploy app commit that uses `lib/db/payment-records.ts`
