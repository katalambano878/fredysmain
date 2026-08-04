# External Service Timeout Report

## Moolre payment

| Item | Status |
|------|--------|
| Used for | Backup MoMo checkout |
| Blocks dashboard load? | **No** |
| Timeout | Gateway HTTP calls should use fetch timeouts in route handlers (verify/callback paths are server-side); client POS uses await without AbortSignal — residual risk |
| Idempotency | `payment_callback_events` + `mark_order_paid` |
| Callback | Records event, validates, marks paid, then notifications |

## Hubtel payment

| Item | Status |
|------|--------|
| Used for | Primary MoMo checkout |
| Blocks dashboard load? | **No** |
| Timeout | Status re-check in callback; verify route on success page |
| Idempotency | Callback event table + already-paid short circuit |
| Callback | Re-verifies with Hubtel status API before mark paid |

## Paystack

| Item | Status |
|------|--------|
| Integration | **None** (FAQ/docs mentions only) |

## Moolre SMS

| Item | Status |
|------|--------|
| Blocks pages? | **No** on dashboard load |
| Blocks callbacks? | Runs after mark-paid inside notification helpers (can delay callback HTTP response) — residual risk to move fully async |
| Duplicate prevention | `sms_message_logs` (payment integrity migration) |

## Meta CAPI

| Item | Status |
|------|--------|
| Timeout | Browser uses sendBeacon/fetch keepalive; server Graph API best-effort (errors logged, never throw into checkout) |
| Blocks UI? | No |

## Retry rules

- Do not retry auth/validation failures
- Payment verify may be user-triggered once from order-success
- Callbacks rely on provider retries + idempotent processing
