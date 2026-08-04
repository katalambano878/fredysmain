# Website Stability Checklist (reusable)

## React / loading

- [ ] Every `setLoading(true)` has `finally { setLoading(false) }`
- [ ] Auth gates have timeouts and retry UI
- [ ] No `useEffect` re-fetches on every pathname unless required
- [ ] Search is debounced; previous request aborted when possible
- [ ] Scroll/touch handlers do not setState every event (use rAF/refs)
- [ ] Intervals/listeners cleaned up on unmount

## API

- [ ] Every code path returns
- [ ] Malformed JSON handled
- [ ] Auth failures return 401/403 quickly
- [ ] External fetches have timeouts
- [ ] Retries are bounded and skip validation errors

## Database

- [ ] One shared pool / client
- [ ] statement_timeout + lock_timeout + idle_in_transaction_session_timeout
- [ ] No external HTTP inside open transactions
- [ ] Admin lists paginated / capped
- [ ] Dashboard uses aggregates, not full table dumps

## Auth / middleware

- [ ] Callbacks/webhooks not redirected to login
- [ ] No redirect loop between middleware and client layout
- [ ] Session failure ≠ infinite spinner

## Payments / SMS

- [ ] Dashboard does not call gateways on load
- [ ] Callbacks are idempotent
- [ ] Amounts verified server-side
- [ ] SMS does not block critical UX (prefer after response)

## Observability

- [ ] `/api/health` exists
- [ ] Slow ops logged with duration (no secrets)
- [ ] Section failures isolated on dashboards
