-- Pending Hubtel-ish orders + recent callback events
SELECT order_number, payment_status, status, payment_method, total,
       created_at, metadata->>'payment_gateway' AS gateway,
       metadata->>'hubtel_client_reference' AS hubtel_ref,
       metadata->>'hubtel_checkout_id' AS checkout_id
FROM orders
WHERE payment_status IS DISTINCT FROM 'paid'
  AND (
    payment_method ILIKE '%hubtel%'
    OR metadata->>'payment_gateway' = 'hubtel'
    OR metadata ? 'hubtel_client_reference'
  )
ORDER BY created_at DESC
LIMIT 40;

SELECT '--- callbacks ---' AS section;

SELECT id, gateway, event_type, order_number, processing_status, created_at, failure_reason
FROM payment_callback_events
WHERE gateway = 'hubtel'
ORDER BY created_at DESC
LIMIT 30;

SELECT '--- recent unpaid any ---' AS section;

SELECT order_number, payment_status, payment_method, total, created_at,
       metadata->>'payment_gateway' AS gateway,
       metadata->>'hubtel_client_reference' AS hubtel_ref
FROM orders
WHERE payment_status = 'pending'
  AND created_at > NOW() - INTERVAL '14 days'
ORDER BY created_at DESC
LIMIT 40;
