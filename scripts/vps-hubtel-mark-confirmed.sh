#!/usr/bin/env bash
set -euo pipefail
# Mark orders Hubtel already confirmed as Success (TransactionAmount matched).

mark_one() {
  local order_number="$1"
  local txn_id="$2"
  echo "Marking $order_number paid (txn=$txn_id)..."
  sudo docker exec -i fleet-postgres psql -U postgres -d frebys -v ON_ERROR_STOP=1 <<SQL
SELECT mark_order_paid('${order_number}', 'hubtel-reconcile-${txn_id}');
UPDATE orders
SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
  'hubtel_reconciled_at', NOW()::text,
  'hubtel_last_status', 'Success',
  'hubtel_checkout_id', '${txn_id}',
  'payment_gateway', 'hubtel'
)
WHERE order_number = '${order_number}';
SELECT order_number, payment_status, status, total
FROM orders WHERE order_number = '${order_number}';
SQL
}

mark_one "ORD-1785943452896-119" "220001b50e614dcb88e187fd7e288f0b"
mark_one "ORD-1785845073771-398" "3410603a657541b3a7cd3bab83f2798b"
mark_one "ORD-1785763613206-787" "39837afa5c6e45adb383b58a24898a45"

echo "Done."
