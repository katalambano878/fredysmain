/**
 * Deep integrity probes for Frebys — counts only, no PII dumps.
 */
import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
  max: 2,
});

async function q(sql) {
  try {
    const r = await pool.query(sql);
    return r.rows;
  } catch (e) {
    return [{ error: String(e.message || e).slice(0, 200) }];
  }
}

async function main() {
  const out = {};

  out.fk_exists = await q(`
    SELECT COUNT(*)::int AS n
    FROM information_schema.table_constraints
    WHERE table_schema='public' AND constraint_type='FOREIGN KEY'
  `);

  out.order_indexes = await q(`
    SELECT indexname, indexdef FROM pg_indexes
    WHERE schemaname='public' AND tablename='orders'
    ORDER BY indexname
  `);

  out.payment_indexes = await q(`
    SELECT tablename, indexname FROM pg_indexes
    WHERE schemaname='public'
      AND (indexdef ILIKE '%payment%' OR indexname ILIKE '%payment%' OR indexname ILIKE '%order_number%')
    ORDER BY tablename, indexname
  `);

  out.orphans = {
    order_items_bad_order: await q(`SELECT COUNT(*)::int AS n FROM order_items oi LEFT JOIN orders o ON o.id=oi.order_id WHERE o.id IS NULL`),
    order_items_bad_product: await q(`SELECT COUNT(*)::int AS n FROM order_items oi LEFT JOIN products p ON p.id=oi.product_id WHERE oi.product_id IS NOT NULL AND p.id IS NULL`),
    product_images_bad: await q(`SELECT COUNT(*)::int AS n FROM product_images pi LEFT JOIN products p ON p.id=pi.product_id WHERE p.id IS NULL`),
    product_variants_bad: await q(`SELECT COUNT(*)::int AS n FROM product_variants v LEFT JOIN products p ON p.id=v.product_id WHERE p.id IS NULL`),
    addresses_bad_user: await q(`SELECT COUNT(*)::int AS n FROM addresses a LEFT JOIN auth.users u ON u.id=a.user_id WHERE a.user_id IS NOT NULL AND u.id IS NULL`),
    cart_bad_user: await q(`SELECT COUNT(*)::int AS n FROM cart_items c LEFT JOIN auth.users u ON u.id=c.user_id WHERE c.user_id IS NOT NULL AND u.id IS NULL`),
    cart_bad_product: await q(`SELECT COUNT(*)::int AS n FROM cart_items c LEFT JOIN products p ON p.id=c.product_id WHERE c.product_id IS NOT NULL AND p.id IS NULL`),
    wishlist_bad: await q(`SELECT COUNT(*)::int AS n FROM wishlist_items w LEFT JOIN products p ON p.id=w.product_id WHERE w.product_id IS NOT NULL AND p.id IS NULL`),
    reviews_bad: await q(`SELECT COUNT(*)::int AS n FROM reviews r LEFT JOIN products p ON p.id=r.product_id WHERE r.product_id IS NOT NULL AND p.id IS NULL`),
    orders_bad_user: await q(`SELECT COUNT(*)::int AS n FROM orders o LEFT JOIN auth.users u ON u.id=o.user_id WHERE o.user_id IS NOT NULL AND u.id IS NULL`),
    osh_bad: await q(`SELECT COUNT(*)::int AS n FROM order_status_history h LEFT JOIN orders o ON o.id=h.order_id WHERE o.id IS NULL`),
    profiles_no_auth: await q(`SELECT COUNT(*)::int AS n FROM profiles p LEFT JOIN auth.users u ON u.id=p.id WHERE u.id IS NULL`),
  };

  out.payment_meta = await q(`
    SELECT
      COUNT(*) FILTER (WHERE metadata ? 'payment_gateway' OR metadata ? 'hubtel_client_reference' OR metadata ? 'payment_method')::int AS with_gateway_meta,
      COUNT(*) FILTER (WHERE payment_transaction_id IS NOT NULL AND payment_transaction_id <> '')::int AS with_txn_id,
      COUNT(*) FILTER (WHERE payment_provider IS NOT NULL AND payment_provider <> '')::int AS with_provider,
      COUNT(*) FILTER (WHERE payment_status::text='paid' AND (payment_transaction_id IS NULL OR payment_transaction_id=''))::int AS paid_without_txn
    FROM orders
  `);

  out.pending_old = await q(`
    SELECT COUNT(*)::int AS n FROM orders
    WHERE payment_status::text='pending'
      AND created_at < now() - interval '7 days'
  `);

  out.mark_order_paid_defs = await q(`
    SELECT pg_get_functiondef(p.oid) AS def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='mark_order_paid'
  `);

  out.unique_order_number = await q(`
    SELECT indexname, indexdef FROM pg_indexes
    WHERE schemaname='public' AND tablename='orders'
      AND (indexdef ILIKE '%UNIQUE%' OR indexname ILIKE '%order_number%')
  `);

  out.auth_schema = await q(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema='auth' ORDER BY table_name
  `);

  out.storage_schema = await q(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema='storage' ORDER BY table_name
  `);

  out.missing_expected = {};
  for (const t of [
    'payment_attempts','payment_callbacks','webhook_events','callback_events',
    'sms_messages','sms_logs','idempotency_keys','sessions'
  ]) {
    const r = await q(`SELECT to_regclass('public.${t}') IS NOT NULL AS exists`);
    out.missing_expected[t] = r[0];
  }

  // Columns used by code that might be missing
  const want = {
    products: ['id','name','slug','price','quantity','status','moq','gender','metadata','track_quantity'],
    product_variants: ['id','product_id','name','price','quantity','option1','option2','option3','image_url'],
    orders: ['id','order_number','total','payment_status','metadata','is_preorder','email','phone'],
    order_items: ['id','order_id','product_id','unit_price','total_price','is_preorder','metadata','variant_name'],
    customers: ['id','email','phone','full_name'],
    blog_posts: ['id','title','slug','status','content'],
    gallery_preorders: ['id','status'],
    homepage_gallery: ['id','image_url','sort_order'],
    store_modules: ['id','enabled'],
    addresses: ['id','user_id','is_default'],
  };
  out.column_presence = {};
  for (const [table, cols] of Object.entries(want)) {
    const rows = await q(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='${table}'
    `);
    if (rows[0]?.error) {
      out.column_presence[table] = { error: rows[0].error };
      continue;
    }
    const have = new Set(rows.map((r) => r.column_name));
    out.column_presence[table] = {
      missing: cols.filter((c) => !have.has(c)),
      present: cols.filter((c) => have.has(c)),
    };
  }

  process.stdout.write(JSON.stringify(out, null, 2));
  await pool.end();
}

main().catch(async (e) => {
  console.error(JSON.stringify({ error: String(e.message || e) }));
  try { await pool.end(); } catch {}
  process.exit(1);
});
