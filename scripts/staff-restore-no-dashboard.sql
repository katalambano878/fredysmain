-- Standard staff permissions; dashboard admin-only. Includes Preorders.
UPDATE roles
SET permissions = '{
  "dashboard": false,
  "end_of_day": false,
  "orders": true,
  "preorders": true,
  "pos": true,
  "products": true,
  "categories": true,
  "customers": true,
  "reviews": true,
  "inventory": true,
  "analytics": false,
  "finance": false,
  "coupons": false,
  "support": false,
  "customer_insights": false,
  "notifications": false,
  "sms_debugger": false,
  "blog": false,
  "modules": false,
  "staff": false,
  "delivery": false,
  "roles": false
}'::jsonb,
updated_at = NOW()
WHERE id = 'staff';

SELECT id,
  permissions->>'dashboard' AS dashboard,
  permissions->>'inventory' AS inventory,
  permissions->>'orders' AS orders,
  permissions->>'preorders' AS preorders,
  permissions->>'pos' AS pos,
  permissions->>'products' AS products,
  permissions->>'customers' AS customers
FROM roles WHERE id = 'staff';
