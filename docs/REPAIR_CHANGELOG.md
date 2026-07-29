# REPAIR CHANGELOG — Frebys (2026-07-29 audit pass)

## Security / data integrity
- Server-trusted pricing in `app/api/orders/create/route.ts`
- Order lookup requires email (`orders/lookup`, `storefront/orders/[orderNumber]`)
- Pay-by-order-number requires `?email=`
- Auth on admin discounts, gallery-preorders, support list/mutate APIs
- Deleted `app/api/debug/env-check`
- Moolre callback rejects when secret missing/mismatch
- Cron payment-reminders requires `CRON_SECRET`
- Middleware fail-closed on legacy auth path
- Admin mark-paid uses `mark_order_paid` RPC

## Plain-PG compatibility
- Replaced bare `SUPABASE_SERVICE_ROLE_KEY` 503 gates with `isPlainPostgres() || key` across storefront + admin APIs + `lib/admin-route-auth.ts`

## UX / payments wiring
- Order-success + payment redirects include `email` query param
- Placeholder images → `/frebys-logo.png`
- Sitemap uses `supabaseAdmin`

## Docs added/updated
- `FULL_SYSTEM_AUDIT.md`
- `PAYMENT_AND_CALLBACK_AUDIT.md`
- `PERFORMANCE_REPORT.md`
- `SUPABASE_TO_POSTGRES_MIGRATION_REPORT.md`
- `REPAIR_CHANGELOG.md`
- Updated hardening + migration guides

## Prior (same branch)
- SW v2.5, money(), addresses, newsletter, blog, storage compress, compact 2-col grids

## Packages
- `sharp` (image compress on upload) — already present from prior commit
