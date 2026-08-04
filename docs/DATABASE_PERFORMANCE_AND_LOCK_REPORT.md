# Database Performance and Lock Report

## Connection architecture

- Singleton `pg.Pool` in `lib/db/pool.ts`
- Accessed via `lib/db/supabase-compat.ts` (PostgREST-shaped) and direct `query()`
- Browser never holds a Postgres connection; talks to `/rest/v1`

## Pool configuration

| Setting | Default | Env |
|---------|---------|-----|
| max | 10 | `PG_POOL_MAX` |
| connectionTimeoutMillis | 10000 | `PG_CONNECT_TIMEOUT_MS` |
| idleTimeoutMillis | 30000 | — |
| statement_timeout | 30000ms | `PG_STATEMENT_TIMEOUT_MS` |
| lock_timeout | 10000ms | `PG_LOCK_TIMEOUT_MS` (**new**) |
| idle_in_transaction_session_timeout | 60000ms | `PG_IDLE_IN_TX_TIMEOUT_MS` (**new**) |

## Connection leaks

- No per-request `new Pool()` found
- Compat layer uses pool queries (release handled by `pg`)

## Open transactions / locks

- Payment integrity uses RPC `mark_order_paid` (short DB work)
- SMS/email run **after** mark-paid (callbacks) — not inside open TX in app code
- New idle-in-tx timeout kills abandoned transactions

## Slow / heavy query patterns (before → after)

| Route | Before | After |
|-------|--------|-------|
| Admin dashboard | `SELECT` all orders into browser | SQL `COUNT/SUM/FILTER` + limited recent |
| Admin orders | Unbounded + nested items | `.range` page/limit (default 300, max 1000) |
| Customers | All customers + 5000 orders | Limit 500 customers + 1000 orders |

## Recommended indexes (verify on live with EXPLAIN)

```sql
-- If not already present:
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_payment_created
  ON orders (payment_status, created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_created_at
  ON orders (created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_quantity
  ON products (quantity) WHERE quantity < 10;
```

Do not apply blindly — confirm with `\d orders` / `pg_indexes` on staging first.

## Health

- `GET /api/health` runs `SELECT 1` and reports `dbLatencyMs`
