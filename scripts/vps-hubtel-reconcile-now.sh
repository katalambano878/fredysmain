#!/usr/bin/env bash
set -euo pipefail
# Immediate Hubtel reconcile using live container credentials + Postgres RPC.
# Does not print secrets.

CID=$(sudo docker ps -q --filter name=k11c9rdumeb14n5algp2db9t | head -n1)
if [ -z "$CID" ]; then
  echo "No frebys container"
  exit 1
fi

HUBTEL_API_ID=$(sudo docker exec "$CID" printenv HUBTEL_API_ID)
HUBTEL_API_KEY=$(sudo docker exec "$CID" printenv HUBTEL_API_KEY)
MERCHANT=$(sudo docker exec "$CID" printenv HUBTEL_MERCHANT_ACCOUNT_NUMBER)

if [ -z "${HUBTEL_API_ID:-}" ] || [ -z "${HUBTEL_API_KEY:-}" ] || [ -z "${MERCHANT:-}" ]; then
  echo "Missing Hubtel env in container"
  exit 1
fi

AUTH=$(printf '%s:%s' "$HUBTEL_API_ID" "$HUBTEL_API_KEY" | base64 -w0 2>/dev/null || printf '%s:%s' "$HUBTEL_API_ID" "$HUBTEL_API_KEY" | base64)

# Export pending orders as TSV: order_number \t total \t hubtel_ref
mapfile -t ROWS < <(sudo docker exec -i fleet-postgres psql -U postgres -d frebys -At -F $'\t' <<'SQL'
SELECT order_number,
       total::text,
       COALESCE(metadata->>'hubtel_client_reference', order_number)
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
LIMIT 40;
SQL
)

echo "Found ${#ROWS[@]} pending Hubtel candidate(s)"
marked=0
pending=0
failed=0
errors=0

for row in "${ROWS[@]}"; do
  [ -z "$row" ] && continue
  order_number=$(printf '%s' "$row" | cut -f1)
  total=$(printf '%s' "$row" | cut -f2)
  ref=$(printf '%s' "$row" | cut -f3)
  url="https://rmsc.hubtel.com/v1/merchantaccount/merchants/${MERCHANT}/transactions/status?clientReference=$(python3 -c "import urllib.parse; print(urllib.parse.quote('''$ref'''))")"

  resp=$(curl -sS --max-time 25 -H "Accept: application/json" -H "Authorization: Basic $AUTH" "$url" || echo '{}')
  status=$(printf '%s' "$resp" | python3 -c '
import sys, json
try:
  j=json.load(sys.stdin)
except Exception:
  print(""); sys.exit(0)
data=j.get("Data") or j.get("data") or {}
if isinstance(data, list):
  data=data[0] if data else {}
s=data.get("TransactionStatus") or data.get("InvoiceStatus") or data.get("Status") or data.get("status") or ""
print(str(s).strip())
' 2>/dev/null || true)

  customer=$(printf '%s' "$resp" | python3 -c '
import sys, json
try:
  j=json.load(sys.stdin)
except Exception:
  print(""); sys.exit(0)
data=j.get("Data") or j.get("data") or {}
if isinstance(data, list):
  data=data[0] if data else {}
v=data.get("TransactionAmount")
if v is None: v=data.get("amount")
if v is None: v=data.get("Amount")
print("" if v is None else str(v))
' 2>/dev/null || true)

  settlement=$(printf '%s' "$resp" | python3 -c '
import sys, json
try:
  j=json.load(sys.stdin)
except Exception:
  print(""); sys.exit(0)
data=j.get("Data") or j.get("data") or {}
if isinstance(data, list):
  data=data[0] if data else {}
v=data.get("AmountAfterFees")
if v is None: v=data.get("AmountAfterCharges")
if v is None: v=data.get("amountAfterCharges")
print("" if v is None else str(v))
' 2>/dev/null || true)

  sl=$(printf '%s' "$status" | tr '[:upper:]' '[:lower:]')
  if [ "$sl" = "paid" ] || [ "$sl" = "success" ] || [ "$sl" = "successful" ] || [ "$sl" = "completed" ]; then
    ok_amount=$(python3 -c "
exp=float('$total')
cust=float('$customer') if '$customer' else None
settle=float('$settlement') if '$settlement' else None
ok=False
if cust is not None and abs(cust-exp)<=0.01: ok=True
elif cust is not None and cust>=exp and cust-exp<=max(5.0,exp*0.05): ok=True
elif settle is not None and settle<=exp+0.01 and exp-settle<=max(15.0,exp*0.05): ok=True
elif cust is None and settle is None: ok=True
print(1 if ok else 0)
")
    if [ "$ok_amount" = "1" ]; then
      sudo docker exec -i fleet-postgres psql -U postgres -d frebys -v ON_ERROR_STOP=1 -c \
        "SELECT mark_order_paid('$order_number', 'hubtel-reconcile-now');" >/dev/null
      echo "MARKED PAID  $order_number  hubtel=$status customer=$customer settlement=$settlement expected=$total"
      marked=$((marked+1))
    else
      echo "AMOUNT MISMATCH  $order_number  hubtel=$status customer=$customer settlement=$settlement expected=$total"
      errors=$((errors+1))
    fi
  elif [ "$sl" = "failed" ] || [ "$sl" = "failure" ] || [ "$sl" = "declined" ] || [ "$sl" = "cancelled" ] || [ "$sl" = "canceled" ]; then
    echo "FAILED AT HUBTEL  $order_number  hubtel=$status"
    failed=$((failed+1))
  else
    echo "STILL PENDING   $order_number  hubtel=${status:-unknown/empty}"
    pending=$((pending+1))
  fi
  sleep 0.3
done

echo
echo "Summary: marked_paid=$marked still_pending=$pending failed_at_gateway=$failed errors=$errors"
