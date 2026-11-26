import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { isPlainPostgres } from '@/lib/db/mode';
import { rowState } from '@/lib/sale-pricing';

export const dynamic = 'force-dynamic';

const PAGE = 500;
const MAX_PRODUCTS = 3000;

/**
 * GET /api/storefront/sale
 * Every active product with a sale that is switched on: the product itself, or any of its sizes.
 */
export async function GET() {
  if (!isPlainPostgres() && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 503 });
  }

  try {
    const rows: any[] = [];
    for (let from = 0; from < MAX_PRODUCTS; from += PAGE) {
      const { data, error } = await supabaseAdmin
        .from('products')
        .select(
          `id, name, slug, price, compare_at_price, quantity, moq, rating_avg, created_at,
           product_images(url, position),
           product_variants(id, name, price, compare_at_price, quantity, option1, option2)`
        )
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      rows.push(...(data || []));
      if (!data || data.length < PAGE) break;
    }

    const products = rows.filter(
      (p) => rowState(p).live || (p.product_variants || []).some((v: any) => rowState(v).live)
    );

    return NextResponse.json(
      { products },
      { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' } }
    );
  } catch (err) {
    console.error('[Storefront Sale API] Error:', err);
    return NextResponse.json({ error: 'Could not load the sale' }, { status: 500 });
  }
}
