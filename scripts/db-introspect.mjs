/**
 * Safe schema introspection for Frebys plain Postgres.
 * Prints JSON inventory — no secrets, no row payloads.
 */
import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
  max: 2,
  ssl: process.env.PGSSL === 'require' ? { rejectUnauthorized: false } : undefined,
});

async function q(text, params = []) {
  const r = await pool.query(text, params);
  return r.rows;
}

async function main() {
  const meta = await q(`
    SELECT current_database() AS db,
           current_user AS usr,
           version() AS ver,
           inet_server_addr()::text AS addr,
           current_setting('server_version') AS server_version
  `);

  const tables = await q(`
    SELECT c.relname AS table_name,
           COALESCE(s.n_live_tup, 0)::bigint AS approx_rows
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY c.relname
  `);

  const columns = await q(`
    SELECT table_name, column_name, data_type, udt_name, is_nullable,
           column_default, character_maximum_length, numeric_precision, numeric_scale
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position
  `);

  const pks = await q(`
    SELECT tc.table_name, kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.table_schema = kcu.table_schema
    WHERE tc.table_schema = 'public' AND tc.constraint_type = 'PRIMARY KEY'
    ORDER BY tc.table_name, kcu.ordinal_position
  `);

  const fks = await q(`
    SELECT
      tc.table_name,
      kcu.column_name,
      ccu.table_name AS foreign_table,
      ccu.column_name AS foreign_column,
      tc.constraint_name,
      rc.update_rule,
      rc.delete_rule
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
    JOIN information_schema.referential_constraints rc
      ON rc.constraint_name = tc.constraint_name AND rc.constraint_schema = tc.table_schema
    WHERE tc.table_schema = 'public' AND tc.constraint_type = 'FOREIGN KEY'
    ORDER BY tc.table_name, kcu.column_name
  `);

  const uniques = await q(`
    SELECT tc.table_name, tc.constraint_name,
           string_agg(kcu.column_name, ',' ORDER BY kcu.ordinal_position) AS columns
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    WHERE tc.table_schema = 'public' AND tc.constraint_type = 'UNIQUE'
    GROUP BY tc.table_name, tc.constraint_name
    ORDER BY tc.table_name
  `);

  const checks = await q(`
    SELECT tc.table_name, tc.constraint_name, cc.check_clause
    FROM information_schema.table_constraints tc
    JOIN information_schema.check_constraints cc
      ON cc.constraint_name = tc.constraint_name AND cc.constraint_schema = tc.table_schema
    WHERE tc.table_schema = 'public' AND tc.constraint_type = 'CHECK'
    ORDER BY tc.table_name
  `);

  const indexes = await q(`
    SELECT tablename, indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
    ORDER BY tablename, indexname
  `);

  const enums = await q(`
    SELECT t.typname AS enum_name,
           string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder) AS values
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
    GROUP BY t.typname
    ORDER BY t.typname
  `);

  const functions = await q(`
    SELECT p.proname AS name,
           pg_get_function_identity_arguments(p.oid) AS args,
           CASE p.prokind WHEN 'f' THEN 'function' WHEN 'p' THEN 'procedure' WHEN 'a' THEN 'aggregate' ELSE p.prokind::text END AS kind
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
    ORDER BY p.proname
  `);

  const triggers = await q(`
    SELECT event_object_table AS table_name, trigger_name, action_timing, event_manipulation
    FROM information_schema.triggers
    WHERE trigger_schema = 'public'
    ORDER BY event_object_table, trigger_name
  `);

  const extensions = await q(`
    SELECT extname, extversion FROM pg_extension ORDER BY extname
  `);

  const rls = await q(`
    SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY c.relname
  `);

  // Integrity probes (counts only)
  const integrity = {};
  const probes = [
    ['orders_total', `SELECT COUNT(*)::int AS n FROM orders`],
    ['orders_paid', `SELECT COUNT(*)::int AS n FROM orders WHERE payment_status::text = 'paid'`],
    ['orders_paid_zero_total', `SELECT COUNT(*)::int AS n FROM orders WHERE payment_status::text = 'paid' AND COALESCE(total,0) <= 0`],
    ['orders_pending', `SELECT COUNT(*)::int AS n FROM orders WHERE payment_status::text = 'pending'`],
    ['order_items', `SELECT COUNT(*)::int AS n FROM order_items`],
    ['orphan_order_items', `SELECT COUNT(*)::int AS n FROM order_items oi LEFT JOIN orders o ON o.id = oi.order_id WHERE o.id IS NULL`],
    ['products', `SELECT COUNT(*)::int AS n FROM products`],
    ['products_price_zero_with_variants', `
      SELECT COUNT(*)::int AS n FROM products p
      WHERE COALESCE(p.price,0) = 0
        AND EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND COALESCE(v.price,0) > 0)`],
    ['product_variants', `SELECT COUNT(*)::int AS n FROM product_variants`],
    ['customers', `SELECT COUNT(*)::int AS n FROM customers`],
    ['profiles', `SELECT COUNT(*)::int AS n FROM profiles`],
    ['auth_users', `SELECT COUNT(*)::int AS n FROM auth.users`],
    ['duplicate_order_numbers', `
      SELECT COUNT(*)::int AS n FROM (
        SELECT order_number FROM orders GROUP BY order_number HAVING COUNT(*) > 1
      ) d`],
    ['duplicate_customer_emails', `
      SELECT COUNT(*)::int AS n FROM (
        SELECT lower(email) FROM customers WHERE email IS NOT NULL GROUP BY lower(email) HAVING COUNT(*) > 1
      ) d`],
  ];

  for (const [key, sql] of probes) {
    try {
      const rows = await q(sql);
      integrity[key] = rows[0]?.n ?? null;
    } catch (e) {
      integrity[key] = { error: String(e.message || e).slice(0, 160) };
    }
  }

  // Important columns for payment/orders
  const orderCols = columns.filter((c) => c.table_name === 'orders').map((c) => c.column_name);
  const hasPaymentAttempts = tables.some((t) => t.table_name === 'payment_attempts');
  const hasWebhookEvents = tables.some((t) =>
    ['payment_callbacks', 'webhook_events', 'callback_events'].includes(t.table_name)
  );
  const hasSmsMessages = tables.some((t) =>
    ['sms_messages', 'sms_logs', 'notification_logs'].includes(t.table_name)
  );

  const out = {
    meta: meta[0],
    summary: {
      table_count: tables.length,
      function_count: functions.length,
      enum_count: enums.length,
      fk_count: fks.length,
      index_count: indexes.length,
      has_payment_attempts: hasPaymentAttempts,
      has_webhook_events: hasWebhookEvents,
      has_sms_messages: hasSmsMessages,
      orders_columns: orderCols,
    },
    tables,
    columns,
    pks,
    fks,
    uniques,
    checks: checks.slice(0, 200),
    indexes,
    enums,
    functions,
    triggers,
    extensions,
    rls,
    integrity,
  };

  process.stdout.write(JSON.stringify(out, null, 2));
  await pool.end();
}

main().catch(async (e) => {
  console.error(JSON.stringify({ error: String(e.message || e) }));
  try { await pool.end(); } catch { /* ignore */ }
  process.exit(1);
});
