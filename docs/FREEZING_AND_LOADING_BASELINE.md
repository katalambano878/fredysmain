# Freezing & Loading Baseline (pre/post repair)

**Date:** 2026-08-04  
**Branch:** `staging/plain-postgres`  
**Stack:** Next.js 15.5 App Router · React 19 · plain Postgres (`pg` pool) · Hubtel + Moolre (no Paystack)

## Architecture snapshot

| Layer | Implementation |
|-------|----------------|
| DB | `lib/db/pool.ts` singleton · max 10 · statement/lock/idle-in-tx timeouts |
| API shape | Supabase-js client → same-origin `/rest/v1`, `/auth/v1` shims |
| Admin auth | Middleware JWT + client layout `/api/admin/me` |
| Payments | Hubtel primary, Moolre backup · callbacks + verify routes |
| SMS | Moolre SMS (not on dashboard load) |

## Baseline symptoms (before repair)

| Symptom | Observed cause |
|---------|----------------|
| Admin “Loading Admin…” forever | `getSession` / `/api/admin/me` with no timeout; re-auth on every `pathname` change |
| Admin “Loading Dashboard…” forever / freeze | Client selected **all** `orders` rows via supabase |
| Orders / customers UI hang | Unpaginated nested order lists; customers + 5000 orders |
| Support / roles stuck spinner | `setLoading(true)` without `finally` on error |
| Storefront jank after scroll | Header + MobileBottomNav setState on every scroll; MobileBottomNav rebinding listener via `lastScrollY` dep |
| Pending network | Almost no client `AbortSignal` / fetch timeouts |

## Baseline measurements (staging / qualitative)

| Metric | Before | Notes |
|--------|--------|-------|
| Admin shell auth | Unbounded | Hung until browser tab abandon |
| Dashboard data path | Full table scan in browser | O(n) orders into JS heap |
| Orders API | Unbounded + embeds | Pool + payload risk |
| PG pool | max 10, statement_timeout 30s | No lock / idle-in-tx timeout |
| Health endpoint | None | — |

## After repair (targets)

| Metric | Target |
|--------|--------|
| Admin auth | ≤ 12s hard fail → retry UI |
| Dashboard API | SQL aggregates · sections via `Promise.allSettled` |
| Orders list | Default limit 300–500, max 1000 |
| Customers | Cap 500 customers + 1000 recent orders for aggregation |
| Health | `GET /api/health` |
