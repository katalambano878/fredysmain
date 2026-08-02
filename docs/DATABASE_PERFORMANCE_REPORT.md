# DATABASE PERFORMANCE REPORT — Frebys

## Pool
- Shared `pg.Pool` in `lib/db/pool.ts`
- Default `max=10` (`PG_POOL_MAX`)
- `connectionTimeoutMillis=10000`
- `statement_timeout=30s` per connection
- Numeric parsed as JS number (PostgREST-faithful)

## Indexes (existing + added)

### Already strong
- `orders(order_number)` unique, email, user, status, payment_status, created_at
- `order_items(order_id)`, `(product_id)`
- `product_variants(product_id)`
- `customers(email)` unique

### Added 2026-08-02
- `payment_attempts` (order_id, order_number, gateway+status, gateway_reference, created)
- `payment_callback_events` (status+received, order_number, payload hash unique)
- `sms_message_logs` (order, created, idempotency)
- `orders(payment_transaction_id)` partial
- `orders((metadata->>'hubtel_client_reference'))` partial
- `orders(payment_status, created_at DESC)`
- `order_items(product_id, variant_name)` partial

## Hot paths
| Path | Notes |
|------|-------|
| Storefront shop/products | RPCs / filtered selects; paginate |
| Checkout create | Per-line product+variant lookups (N queries) — acceptable at cart size |
| Payment callback | Order by `order_number` (unique index) |
| Admin orders | Ensure pagination remains |

## Recommendations
1. Consider batching variant lookup in `/api/orders/create` (`WHERE product_id = ANY($1)`).
2. CDN for `/storage` images (already compressed on disk).
3. Reconcile 34 pending orders older than 7 days via admin tool (no auto-delete).
