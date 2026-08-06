UPDATE roles
SET permissions = '{
  "dashboard": false,
  "end_of_day": false,
  "orders": false,
  "pos": false,
  "products": false,
  "categories": false,
  "customers": false,
  "reviews": false,
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

SELECT id, permissions->>'dashboard' AS dashboard, permissions->>'inventory' AS inventory
FROM roles WHERE id = 'staff';
