#!/usr/bin/env bash
set -euo pipefail
# Update staff role: inventory only (no dashboard). Run on VPS with frebys DB access.
sudo docker exec fleet-postgres psql -U postgres -d frebys -v ON_ERROR_STOP=1 <<'SQL'
SELECT id, name, permissions FROM roles WHERE id = 'staff' OR name ILIKE '%staff%';

UPDATE roles
SET permissions = jsonb_build_object(
  'dashboard', false,
  'orders', false,
  'pos', false,
  'products', false,
  'categories', false,
  'customers', false,
  'reviews', false,
  'inventory', true,
  'analytics', false,
  'finance', false,
  'coupons', false,
  'support', false,
  'customer_insights', false,
  'notifications', false,
  'sms_debugger', false,
  'blog', false,
  'modules', false,
  'staff', false,
  'delivery', false,
  'roles', false,
  'end_of_day', false
),
updated_at = NOW()
WHERE id = 'staff';

SELECT id, name, permissions FROM roles WHERE id = 'staff';
SQL
