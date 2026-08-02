# PAYMENT DATABASE AUDIT — Frebys

## Gateways

| Gateway | Code | DB tables used |
|---------|------|----------------|
| **Hubtel** | Primary MoMo | `orders`, `payment_attempts`, `payment_callback_events` |
| **Moolre** | Backup MoMo + SMS | same + `sms_message_logs` |
| **Paystack** | Not implemented | — |

## Tables

### `payment_attempts`
- Unique `internal_reference` (Hubtel client ref / Moolre externalref)
- `expected_amount` from DB order total (never client)
- Status: pending → processing → successful/failed
- Written on initiate; marked successful by `mark_order_paid`

### `payment_callback_events`
- Dedupe: unique `(gateway, payload_hash)`
- Optional unique `(gateway, external_event_id)`
- Callbacks mark `processed` / `ignored` / `failed`

### `orders` (legacy + source of truth for total)
- `payment_status` enum: pending/paid/failed/refunded/partially_refunded
- `payment_transaction_id` now set by hardened `mark_order_paid`
- Metadata still stores gateway hints (`hubtel_client_reference`, etc.)

## Per-gateway

### Hubtel
- Init: `/api/payment/hubtel` → `recordPaymentAttempt`
- Callback: `/api/payment/hubtel/callback` → event record → status API verify → amount check → `mark_order_paid(order_ref, checkoutId)`
- Duplicate: already-paid short-circuit + callback event status

### Moolre
- Init: `/api/payment/moolre` → attempt with `-R{timestamp}` ref
- Callback: secret required → event record → amount check → `mark_order_paid`
- SMS: `sendOrderConfirmation` after paid; log table available via `recordSmsAttempt`

### Paystack
- Not present in repo

## Integrity rules
- Amount from `orders.total` only
- Successful payment cannot be overwritten to failed by delayed callback (RPC skips if paid)
- Stock reduced once (`metadata.stock_reduced`)
