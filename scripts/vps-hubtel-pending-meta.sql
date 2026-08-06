SELECT order_number,
       payment_status,
       total,
       payment_method,
       created_at,
       metadata->>'payment_gateway' AS gateway,
       metadata->>'hubtel_client_reference' AS hubtel_ref,
       metadata->>'hubtel_checkout_id' AS checkout_id,
       metadata->>'hubtel_balance_reference' AS balance_ref,
       left(metadata::text, 400) AS meta_snip
FROM orders
WHERE payment_status IS DISTINCT FROM 'paid'
  AND total > 0
  AND (
    payment_method ILIKE '%hubtel%'
    OR metadata->>'payment_gateway' = 'hubtel'
    OR metadata ? 'hubtel_client_reference'
  )
  AND created_at > NOW() - INTERVAL '30 days'
ORDER BY created_at DESC
LIMIT 20;
