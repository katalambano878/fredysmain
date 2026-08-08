/**
 * Apply a clean 10% site-wide sale on Frebys.
 * - Uses compare_at_price as original when already discounted, else current price
 * - Updates products AND variants (most dresses price on Age sizes)
 * - Saves discount_campaign so admin can turn sale OFF and restore originals
 *
 * Run in frebys container: node /app/scripts/vps-apply-10pct-sale.mjs
 */
import pg from 'pg';

const { Client } = pg;
const PCT = 10;

function money(n) {
  return Math.round(Number(n) * 100) / 100;
}

async function main() {
  const databaseUrl =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_CONNECTION_STRING;
  if (!databaseUrl) {
    console.error('Missing DATABASE_URL');
    process.exit(1);
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await client.query('BEGIN');

    // Products: active only
    const products = await client.query(
      `SELECT id, name, price, compare_at_price
       FROM products
       WHERE status = 'active'`
    );

    let productsUpdated = 0;
    let productsSkipped = 0;

    for (const p of products.rows) {
      const price = Number(p.price) || 0;
      const compare = Number(p.compare_at_price) || 0;
      const original = compare > price && compare > 0 ? compare : price;
      if (!(original > 0)) {
        productsSkipped++;
        continue;
      }
      const discounted = money(original * (1 - PCT / 100));
      await client.query(
        `UPDATE products
         SET price = $1, compare_at_price = $2, updated_at = now()
         WHERE id = $3`,
        [discounted, original, p.id]
      );
      productsUpdated++;
    }

    // Variants belonging to active products
    const variants = await client.query(
      `SELECT v.id, v.price, v.compare_at_price, p.name AS product_name, v.name AS variant_name
       FROM product_variants v
       JOIN products p ON p.id = v.product_id
       WHERE p.status = 'active'`
    );

    let variantsUpdated = 0;
    let variantsSkipped = 0;

    for (const v of variants.rows) {
      const price = Number(v.price) || 0;
      const compare = Number(v.compare_at_price) || 0;
      const original = compare > price && compare > 0 ? compare : price;
      if (!(original > 0)) {
        variantsSkipped++;
        continue;
      }
      const discounted = money(original * (1 - PCT / 100));
      await client.query(
        `UPDATE product_variants
         SET price = $1, compare_at_price = $2
         WHERE id = $3`,
        [discounted, original, v.id]
      );
      variantsUpdated++;
    }

    // Campaign flag for admin Discounts page / restore
    const campaign = {
      active: true,
      type: 'percent',
      value: PCT,
      updated_at: new Date().toISOString(),
    };

    const existing = await client.query(
      `SELECT id FROM site_settings WHERE key = 'discount_campaign' LIMIT 1`
    );
    if (existing.rows[0]) {
      await client.query(
        `UPDATE site_settings
         SET value = $1::jsonb, category = 'promotions', updated_at = now()
         WHERE key = 'discount_campaign'`,
        [JSON.stringify(campaign)]
      );
    } else {
      await client.query(
        `INSERT INTO site_settings (key, value, category, updated_at)
         VALUES ('discount_campaign', $1::jsonb, 'promotions', now())`,
        [JSON.stringify(campaign)]
      );
    }

    await client.query('COMMIT');

    console.log(
      JSON.stringify(
        {
          ok: true,
          percent: PCT,
          products_updated: productsUpdated,
          products_skipped_zero_price: productsSkipped,
          variants_updated: variantsUpdated,
          variants_skipped_zero_price: variantsSkipped,
          campaign,
        },
        null,
        2
      )
    );

    // Spot-check dresses
    const check = await client.query(
      `SELECT p.name, p.slug, v.name AS variant, v.price AS sale_price, v.compare_at_price AS original
       FROM products p
       JOIN product_variants v ON v.product_id = p.id
       WHERE p.slug IN ('t-27', 'f-46')
       ORDER BY p.slug`
    );
    console.log('\nSpot check:');
    for (const r of check.rows) {
      console.log(
        `  ${r.name} (${r.slug}) ${r.variant}: ${r.sale_price} (was ${r.original})`
      );
    }
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(e);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
