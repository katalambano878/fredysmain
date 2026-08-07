#!/usr/bin/env bash
set -euo pipefail
CID=$(sudo docker ps -q --filter name=k11c9rdumeb14n5algp2db9t | head -n1)
if [ -z "$CID" ]; then
  echo "No frebys container"
  exit 1
fi
sudo docker cp /tmp/vps-create-staff-employees.mjs "$CID":/app/scripts/vps-create-staff-employees.mjs
sudo docker exec -w /app "$CID" node /app/scripts/vps-create-staff-employees.mjs
