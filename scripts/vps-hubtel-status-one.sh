#!/usr/bin/env bash
set -euo pipefail
REF="${1:?clientReference required}"
CID=$(sudo docker ps -q --filter name=k11c9rdumeb14n5algp2db9t | head -n1)
HUBTEL_API_ID=$(sudo docker exec "$CID" printenv HUBTEL_API_ID)
HUBTEL_API_KEY=$(sudo docker exec "$CID" printenv HUBTEL_API_KEY)
MERCHANT=$(sudo docker exec "$CID" printenv HUBTEL_MERCHANT_ACCOUNT_NUMBER)
AUTH=$(printf '%s:%s' "$HUBTEL_API_ID" "$HUBTEL_API_KEY" | base64 -w0 2>/dev/null || printf '%s:%s' "$HUBTEL_API_ID" "$HUBTEL_API_KEY" | base64)
URL="https://rmsc.hubtel.com/v1/merchantaccount/merchants/${MERCHANT}/transactions/status?clientReference=$(python3 -c "import urllib.parse; print(urllib.parse.quote('''$REF'''))")"
curl -sS --max-time 25 -H "Accept: application/json" -H "Authorization: Basic ${AUTH}" "$URL" | python3 -m json.tool
