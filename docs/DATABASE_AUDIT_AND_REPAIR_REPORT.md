# DATABASE AUDIT AND REPAIR REPORT — Frebys

**Date:** 2026-08-02  
**Database:** `frebys` on `fleet-postgres` (VPS / Coolify)  
**App:** `frebys-app` (`k11c9rdumeb14n5algp2db9t`) — branch `staging/plain-postgres`  
**Note:** Staging Coolify app was previously removed; this database is the **live Frebys store database**. All changes were additive/reversible.

---

## Baseline (before this pass)

| Check | Result |
|-------|--------|
| PostgreSQL | **16.14** (Debian) |
| App DB role | `frebys` |
| Architecture | Shape A — `pg` pool + `lib/db/supabase-compat` + `/rest/v1` shims |
| ORM | None (raw SQL via compat layer) |
| Migration system | SQL files under `supabase/migrations/` (manual apply) |
| Tables | **49** public tables |
| Functions | **67** (incl. pgcrypto helpers) |
| Foreign keys | **51** (data orphans: **0**) |
| Payment attempts table | **Missing** |
| Callback events table | **Missing** |
| SMS log table | **Missing** |
| Orders | 404 total / 367 paid / 37 pending |
| Products | 1129 (1080 with base price 0 + priced variants) |
| Paid without `payment_transaction_id` | **367** (legacy metadata-only flow) |

---

## Architecture summary

```
Browser → @supabase/supabase-js → app origin /rest/v1|/auth/v1|/storage/v1
Server  → lib/supabase-admin → lib/db/supabase-compat → lib/db/pool (pg) → fleet-postgres/frebys
Auth    → auth.users (minimal GoTrue shim) + JWT (AUTH_JWT_SECRET)
Storage → disk STORAGE_ROOT (no storage.* schema tables)
```

**Connection:** shared `Pool` (`PG_POOL_MAX` default 10), `statement_timeout` 30s, optional `PGSSL=require`.

---

## Schema-drift matrix (high signal)

| Object | Code expectation | Actual DB | Problem | Repair |
|--------|------------------|-----------|---------|--------|
| `payment_attempts` | Needed for multi-attempt payments | Missing | Attempts only in `orders.metadata` | **Created** |
| `payment_callback_events` | Idempotent callbacks | Missing | Duplicate callbacks hard to track | **Created** |
| `sms_message_logs` | SMS dedupe / delivery | Missing | No SMS audit table | **Created** |
| `orders.total` check | Non-negative | Unconstrained | Could store invalid totals | **CHECK added** |
| Hubtel ref index | Fast callback lookup | Missing | Seq scan on metadata | **Expression index** |
| `mark_order_paid(text)` | Idempotent + txn id | Stock OK; txn id weak | Paid rows lacked txn id | **Hardened** |
| Core store tables | Match complete_schema | Present + later migrations | None material | Healthy |
| Paystack tables | N/A | N/A | Not implemented | Documented |

---

## Integrity findings

| Finding | Count | Action |
|---------|------:|--------|
| Orphan order items | 0 | None |
| Orphan variants/images | 0 | None |
| Duplicate order numbers | 0 | Unique index already present |
| Duplicate customer emails | 0 | Unique present |
| Products priced only on variants | 1080 | App fix already (variant resolve) |
| Pending orders > 7 days | 34 | Manual reconcile recommended |
| Paid without gateway txn id | 367 | Historical; new paid writes txn id |

---

## Repairs completed (2026-08-02)

1. Migration `20260802000000_payment_integrity.sql` applied to `frebys` as `postgres`.
2. Grants to role `frebys` on new tables + `mark_order_paid` execute.
3. App helpers: `lib/db/payment-records.ts`.
4. Hubtel/Moolre initiate + callback routes record attempts/events.
5. Pool: connection timeout + statement timeout.
6. Documentation suite under `docs/`.

---

## Remaining risks / manual actions

1. Historical paid orders will not backfill `payment_attempts` (optional script later).
2. Paystack not in codebase — do not add tables until integrated.
3. Confirm Coolify secrets: `MOOLRE_CALLBACK_SECRET`, `CRON_SECRET`.
4. MCP `user-mamator` points at **Mamator** Supabase — not Frebys; do not run Frebys repairs there.
5. New tables owned by `postgres` with grants to `frebys` — acceptable; optionally `ALTER TABLE ... OWNER TO frebys` later.

---

## Final readiness

**Ready after listed manual actions** for continued staging/production testing of payment flows against the new tables.
