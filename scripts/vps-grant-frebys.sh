#!/bin/bash
set -euo pipefail
sudo docker exec fleet-postgres psql -U postgres -d frebys -v ON_ERROR_STOP=1 <<'SQL'
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_attempts TO frebys;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_callback_events TO frebys;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sms_message_logs TO frebys;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO frebys;
-- Ensure frebys can call updated functions
GRANT EXECUTE ON FUNCTION public.mark_order_paid(text, text) TO frebys;
GRANT EXECUTE ON FUNCTION public.mark_order_paid(uuid, text, text) TO frebys;
SQL
echo "Grants OK"
