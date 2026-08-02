#!/bin/bash
set -euo pipefail
# Verify frebys role can use new tables (no secrets printed)
sudo docker exec fleet-postgres psql -U frebys -d frebys -v ON_ERROR_STOP=1 <<'SQL'
SELECT to_regclass('public.payment_attempts') AS payment_attempts,
       to_regclass('public.payment_callback_events') AS callbacks,
       to_regclass('public.sms_message_logs') AS sms;
INSERT INTO payment_callback_events (gateway, payload_hash, signature_status, processing_status, payload)
VALUES ('other', 'audit-probe-' || gen_random_uuid()::text, 'unchecked', 'ignored', '{}'::jsonb)
RETURNING id;
SELECT COUNT(*)::int AS callback_rows FROM payment_callback_events;
SQL
echo "Verify OK"
