#!/bin/bash
set -euo pipefail
SQL_FILE="${1:-/tmp/20260802000000_payment_integrity.sql}"
echo "Applying $SQL_FILE to frebys as postgres..."
sudo docker cp "$SQL_FILE" fleet-postgres:/tmp/migrate.sql
sudo docker exec fleet-postgres psql -U postgres -d frebys -v ON_ERROR_STOP=1 -f /tmp/migrate.sql
echo "Verifying tables..."
sudo docker exec fleet-postgres psql -U postgres -d frebys -c "\dt public.payment_*"
sudo docker exec fleet-postgres psql -U postgres -d frebys -c "\dt public.sms_message_logs"
sudo docker exec fleet-postgres psql -U postgres -d frebys -c "SELECT COUNT(*) AS payment_attempts FROM payment_attempts;"
echo "OK"
