# PAYMENT AND CALLBACK AUDIT — Frebys

## Gateways

| Gateway | Status | Role |
|---------|--------|------|
| **Hubtel** | Implemented | Primary MoMo (`NEXT_PUBLIC_ENABLE_HUBTEL`) |
| **Moolre** | Implemented | Backup MoMo + POS + SMS |
| **Paystack** | Not implemented | FAQ copy only |

## Flows

### Hubtel
1. Checkout → `/api/orders/create` (server-priced) → `/api/payment/hubtel`
2. Initiate uses **DB `orders.total`**
3. Redirect → `/order-success?order=&email=&payment_success=true`
4. Callback → `/api/payment/hubtel/callback` re-verifies Hubtel status API, amount match, `mark_order_paid`, `sendOrderConfirmation`

### Moolre
1. Initiate → `/api/payment/moolre` (DB total)
2. Callback → `/api/payment/moolre/callback`
3. **Secret required** — rejects if `MOOLRE_CALLBACK_SECRET` missing or mismatch
4. Verify → `/api/payment/moolre/verify` (admin / success page)

## Amount integrity
- Payment routes: **server-trusted** from DB.
- Order create (Jul 2026 repair): **recomputes** line prices from products/variants; ignores client totals.

## Idempotency
- Callbacks skip if `payment_status === 'paid'`.
- `mark_order_paid` RPC handles stock via metadata (`stock_reduced`).
- Residual race: duplicate notifications possible under concurrent callbacks — acceptable with RPC guard.

## SMS
- On paid: `sendOrderConfirmation` → Moolre SMS (`MOOLRE_SMS_API_KEY` / fallback).
- Cron reminders: `/api/cron/payment-reminders` requires `CRON_SECRET`.

## Admin mark-paid
- `/api/admin/orders/[id]/mark-paid` now prefers `mark_order_paid` RPC (stock/stats).

## Manual Coolify checks
- [ ] `MOOLRE_CALLBACK_SECRET` set
- [ ] `CRON_SECRET` set
- [ ] Hubtel credentials + callback URL
- [ ] Moolre credentials + callback URL
