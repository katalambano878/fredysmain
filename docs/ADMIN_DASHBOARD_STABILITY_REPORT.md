# Admin Dashboard Stability Report

## Sections

| Section | Source | Timeout | Error state | Optimized |
|---------|--------|---------|-------------|-----------|
| Shell auth | `/api/admin/me` via layout | 8s session / 12s me | Retry + login link | Yes |
| KPI stats | `/api/admin/dashboard` SQL aggregates | 20s client | Full-page retry | Yes |
| Revenue chart | Same API (7-day group by) | same | same | Yes |
| Recent orders | Same API `LIMIT 5` | same | empty OK | Yes |
| Low stock | Same API `LIMIT 5` | same | empty OK | Yes |
| Products strip | Same API `LIMIT 4` | same | empty OK | Yes |

Server uses `Promise.allSettled` so one section query failure does not abort others (`sections` flags in JSON).

## Loading states

- Layout: “Loading Admin…” → timeout → retry UI (never infinite)
- Page: “Loading Dashboard…” → error + Retry
- Route `app/admin/loading.tsx` for navigation transitions

## Pagination

- Orders list API: page/limit (client requests `limit=500`)
- Customers: capped selects
- Support tickets: already ranged (20/page)

## Test results (manual / code-path)

- [x] Auth timeout clears spinner
- [x] Dashboard no longer selects all orders
- [x] Failed dashboard shows Retry
- [ ] Full browser e2e on production deploy (post-deploy smoke)
