# Freezing and Loading Audit

## Pages inspected

- Store: home, shop, product, cart, checkout, pay, order-success, account, auth
- Admin: layout shell, dashboard, orders, customers, roles, support/*, finance/staff, POS (payment timeout note)
- APIs: `/api/admin/me`, `/api/admin/dashboard`, `/api/admin/orders`, payment callbacks/verify, `/api/health`

## Infinite loading states found

1. Admin layout auth without timeout + re-run on every route
2. Dashboard full-order fetch
3. Roles / support / analytics / KB / conversations / finance staff missing `finally`
4. Account page early return without clearing loading

## React loops found

1. Admin layout `[pathname]` re-auth (fixed: auth once until success)
2. Knowledge-base fetch on every keystroke (fixed: debounce 350ms)
3. MobileBottomNav scroll effect depending on `lastScrollY` (fixed: rAF + refs)

## Pending requests found

- Systemic lack of fetch timeouts on admin-critical paths (mitigated with `lib/fetch-timeout.ts`)

## Redirect loops found

- Middleware + layout double gate could race; layout now times out and shows retry instead of spinning forever
- Payment callbacks excluded from admin auth (middleware only gates `/admin`)

## External blocking calls found

- **Not** on dashboard load (Hubtel/Moolre/SMS)
- POS checkout awaits payment initiate without AbortSignal (noted; finally exists)

## Root causes

1. Hung auth promises  
2. Unbounded admin data loads  
3. Loading cleanup gaps  
4. Scroll setState storms  
5. Plain-PG `/api/admin/me` using fragile anon client path  

## Fixes applied

- Timed admin auth + error/retry UI  
- `/api/admin/dashboard` aggregates  
- Orders pagination caps  
- Customers query caps  
- `finally` + timeouts on support/roles/staff  
- Pool lock + idle-in-tx timeouts  
- Health check  
- Scroll rAF throttling  

## Remaining risks

- Analytics / customer-insights / finance pages may still pull large slices (partially out of scope this pass)
- Orders UI still loads up to 500 rows (not full cursor pagination UI)
- No automated e2e timeout suite yet
- `typescript.ignoreBuildErrors` still enabled in Next config (pre-existing)
