# FULL SYSTEM AUDIT — Frebys Fashion GH

**Date:** 2026-07-29  
**Repo:** `katalambano878/fredysmain`  
**Branch:** `staging/plain-postgres`  
**Production:** https://www.frebysfashion.com  
**Coolify:** `frebys-app` (`k11c9rdumeb14n5algp2db9t`) — staging app removed  

---

## Baseline (before this repair pass)

| Check | Status |
|-------|--------|
| Architecture | Shape A — shimmed `@supabase/supabase-js` → `/rest/v1`, `/auth/v1`, `/storage/v1` + `DATABASE_URL` |
| Git | Ahead of hardening + card/image work (`a2cb500`); uncommitted docs then this security pass |
| Payments in code | Hubtel (primary) + Moolre (backup) — **no Paystack implementation** |
| SMS | Moolre VAS via `lib/notifications.ts` |
| Prior hardening | SW v2.5, money(), addresses, newsletter, blog CRUD, storage compress ~1.1GB→159MB, 2-col mobile grids |
| `typescript.ignoreBuildErrors` | Still `true` in `next.config.ts` (legacy migration debt) |

### Critical issues discovered (P0)

1. **Client-trusted checkout totals** — `/api/orders/create` inserted client `total` / `unit_price` → price manipulation.
2. **Unauthenticated order PII** — `/api/orders/lookup`, `/api/storefront/orders/[orderNumber]` returned full orders by number alone.
3. **Unauthenticated admin mutations** — `/api/admin/discounts`, `/api/admin/gallery-preorders`, most `/api/support/*` list/mutate routes.
4. **Optional secrets fail-open** — Moolre callback + cron payment-reminders processed when secrets unset.
5. **Debug env endpoint** — `/api/debug/env-check` leaked env key metadata without auth.
6. **Middleware fail-open** — legacy hosted path swallowed auth errors when service key missing.
7. **`SUPABASE_SERVICE_ROLE_KEY` gates** — many APIs returned 503 in plain-PG-only deploys.

---

## Architecture summary

| Layer | Implementation |
|-------|----------------|
| Browser DB | `lib/supabase.ts` → app origin shims |
| Server DB | `lib/supabase-admin.ts` → `lib/db/supabase-compat` when `DATABASE_URL` set |
| Auth | GoTrue shim `app/auth/v1` + JWT (`AUTH_JWT_SECRET`) |
| Storage | Disk `STORAGE_ROOT` → `/storage/v1/...` |
| Admin gate | `middleware.ts` + `requireAdminSession` |

**Pages:** ~79 `page.tsx`  
**API routes:** ~60+  
**Paystack:** FAQ/marketing only — not integrated  

---

## Repairs applied in this pass

See `REPAIR_CHANGELOG.md`, `PAYMENT_AND_CALLBACK_AUDIT.md`, `PERFORMANCE_REPORT.md`, `SUPABASE_TO_POSTGRES_MIGRATION_REPORT.md`.

---

## Remaining risks / manual actions

1. Confirm Coolify has `MOOLRE_CALLBACK_SECRET` and `CRON_SECRET` set (callbacks/cron now **fail closed**).
2. Register Hubtel/Moolre callback URLs still point at production domain.
3. Turn off `ignoreBuildErrors` after a dedicated TypeScript cleanup.
4. Chat order creation still inserts prices client-side in `lib/chat-tools.ts` — follow-up to route through `/api/orders/create`.
5. Paystack not implemented — remove FAQ claim or integrate later.
6. Admin pages still query browser supabase for many screens (works via shim; prefer BFF long-term).

---

## Production readiness

**Ready after listed manual actions** (verify secrets in Coolify, redeploy this commit, smoke-test checkout + one payment callback path in sandbox if available).
