#!/usr/bin/env bash
set -euo pipefail
# Run Hubtel reconcile against pending orders using the live app container env.
# Does not print secrets.

CID=$(sudo docker ps -q --filter name=k11c9rdumeb14n5algp2db9t | head -n1)
if [ -z "$CID" ]; then
  echo "No frebys container running"
  exit 1
fi

echo "Using container $CID"
# Prefer cron endpoint if CRON_SECRET is set in the container
SECRET=$(sudo docker exec "$CID" printenv CRON_SECRET 2>/dev/null || true)
APP_URL=$(sudo docker exec "$CID" printenv NEXT_PUBLIC_APP_URL 2>/dev/null || echo "https://www.frebysfashion.com")
APP_URL=${APP_URL%/}

if [ -n "$SECRET" ]; then
  echo "Calling cron reconcile via $APP_URL ..."
  curl -sS -X GET "$APP_URL/api/cron/reconcile-payments" \
    -H "Authorization: Bearer $SECRET" \
    -H "Accept: application/json" | head -c 4000
  echo
else
  echo "CRON_SECRET not set in container — listing pending hubtel orders from DB instead"
  sudo docker exec -i fleet-postgres psql -U postgres -d frebys <<'SQL'
SELECT order_number, total, created_at, metadata->>'hubtel_client_reference' AS ref
FROM orders
WHERE payment_status IS DISTINCT FROM 'paid'
  AND (payment_method ILIKE '%hubtel%' OR metadata->>'payment_gateway'='hubtel')
  AND total > 0
ORDER BY created_at DESC
LIMIT 20;
SQL
fi
