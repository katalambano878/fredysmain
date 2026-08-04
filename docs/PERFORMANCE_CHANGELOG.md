# Performance Changelog — Freezing / Loading Pass

## Files changed (main)

- `app/admin/layout.tsx` — timed auth, once-until-success, error UI
- `app/api/admin/me/route.ts` — supabaseAdmin / plain-PG path
- `app/api/admin/dashboard/route.ts` — **new** aggregates API
- `app/admin/page.tsx` — uses dashboard API + retry
- `app/api/admin/orders/route.ts` — pagination caps
- `app/admin/orders/OrdersListClient.tsx` — timed fetch, limit 500
- `app/admin/customers/page.tsx` — query caps
- `app/admin/roles/page.tsx` — finally
- `app/admin/support/**` — finally / debounce / timeouts
- `app/admin/finance/staff/page.tsx` — finally + timeout
- `app/(store)/account/page.tsx` — finally
- `components/MobileBottomNav.tsx`, `components/Header.tsx` — rAF scroll
- `lib/fetch-timeout.ts` — **new**
- `lib/db/pool.ts` — lock + idle-in-tx timeouts
- `app/api/health/route.ts` — **new**
- `app/admin/loading.tsx` — **new**
- Docs under `docs/`

## Indexes

- Documented recommended indexes; not auto-applied (confirm on live first)

## Timeouts added

- Client: 8–25s depending on route
- PG: statement 30s, lock 10s, idle-in-tx 60s (configurable)

## Error boundaries

- Existing `app/admin/error.tsx` retained
- Layout-level auth error UI added (layout errors are not caught by route error.tsx)

## Tests

- No new automated suite in this pass; manual verification checklist in stability docs
