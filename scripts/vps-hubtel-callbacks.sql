\d payment_callback_events

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'payment_callback_events'
ORDER BY ordinal_position;

SELECT *
FROM payment_callback_events
WHERE gateway = 'hubtel'
ORDER BY 1 DESC
LIMIT 20;

SELECT processing_status, COUNT(*)
FROM payment_callback_events
GROUP BY 1;
