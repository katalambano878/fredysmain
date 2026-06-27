import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/**
 * GET — list all products that currently have a discount
 * (compare_at_price is set and greater than price)
 */
export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('products')
    .select('id, name, price, compare_at_price, status, product_images(url)')
    .not('compare_at_price', 'is', null)
    .order('name');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const discounted = (data || [])
    .filter((p: any) => p.compare_at_price && p.compare_at_price > p.price)
    .map((p: any) => ({
      id: p.id,
      name: p.name,
      price: p.price,
      original_price: p.compare_at_price,
      discount_amount: +(p.compare_at_price - p.price).toFixed(2),
      discount_percent: Math.round((1 - p.price / p.compare_at_price) * 100),
      status: p.status,
      image: p.product_images?.[0]?.url || null,
    }));

  return NextResponse.json(discounted);
}

/**
 * POST — apply discount to selected products
 * Body: { product_ids: string[], type: 'percent' | 'fixed', value: number }
 *
 * - Saves the current price as compare_at_price (original price backup)
 * - Sets price to the discounted amount
 * - If a product already has a discount, uses compare_at_price as the base
 */
export async function POST(req: NextRequest) {
  try {
    const { product_ids, type, value } = await req.json();

    if (!Array.isArray(product_ids) || product_ids.length === 0) {
      return NextResponse.json({ error: 'Select at least one product.' }, { status: 400 });
    }
    if (!type || !['percent', 'fixed'].includes(type)) {
      return NextResponse.json({ error: 'Type must be "percent" or "fixed".' }, { status: 400 });
    }
    if (typeof value !== 'number' || value <= 0) {
      return NextResponse.json({ error: 'Value must be a positive number.' }, { status: 400 });
    }
    if (type === 'percent' && value >= 100) {
      return NextResponse.json({ error: 'Percentage must be less than 100.' }, { status: 400 });
    }

    const { data: products, error: fetchError } = await supabaseAdmin
      .from('products')
      .select('id, name, price, compare_at_price')
      .in('id', product_ids);

    if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
    if (!products || products.length === 0) {
      return NextResponse.json({ error: 'No products found.' }, { status: 404 });
    }

    const updates: { id: string; name: string; original: number; discounted: number }[] = [];
    let failed = 0;

    for (const product of products) {
      const originalPrice = product.compare_at_price && product.compare_at_price > product.price
        ? product.compare_at_price
        : product.price;

      let discountedPrice: number;
      if (type === 'percent') {
        discountedPrice = +(originalPrice * (1 - value / 100)).toFixed(2);
      } else {
        discountedPrice = +(originalPrice - value).toFixed(2);
      }

      if (discountedPrice < 0) discountedPrice = 0;

      const { error: updateError } = await supabaseAdmin
        .from('products')
        .update({ price: discountedPrice, compare_at_price: originalPrice })
        .eq('id', product.id);

      if (updateError) {
        failed++;
        console.error(`[discounts] failed to update ${product.id}:`, updateError);
      } else {
        updates.push({ id: product.id, name: product.name, original: originalPrice, discounted: discountedPrice });
      }
    }

    return NextResponse.json({
      message: `Discount applied to ${updates.length} product(s).${failed ? ` ${failed} failed.` : ''}`,
      updated: updates,
    });
  } catch (err) {
    console.error('[discounts] unexpected error:', err);
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
  }
}

/**
 * DELETE — remove discount from selected products (restore original price)
 * Body: { product_ids: string[] }  OR  { all: true }
 *
 * Restores price from compare_at_price, then clears compare_at_price.
 */
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const removeAll = body.all === true;
    const productIds: string[] = body.product_ids || [];

    if (!removeAll && productIds.length === 0) {
      return NextResponse.json({ error: 'Provide product_ids or set all: true.' }, { status: 400 });
    }

    let query = supabaseAdmin
      .from('products')
      .select('id, price, compare_at_price')
      .not('compare_at_price', 'is', null);

    if (!removeAll) {
      query = query.in('id', productIds);
    }

    const { data: products, error: fetchError } = await query;
    if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });

    let restored = 0;
    let failed = 0;

    for (const product of (products || [])) {
      if (!product.compare_at_price || product.compare_at_price <= product.price) continue;

      const { error: updateError } = await supabaseAdmin
        .from('products')
        .update({ price: product.compare_at_price, compare_at_price: null })
        .eq('id', product.id);

      if (updateError) {
        failed++;
        console.error(`[discounts] failed to restore ${product.id}:`, updateError);
      } else {
        restored++;
      }
    }

    return NextResponse.json({
      message: `Restored original price for ${restored} product(s).${failed ? ` ${failed} failed.` : ''}`,
      restored,
    });
  } catch (err) {
    console.error('[discounts] unexpected error:', err);
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
  }
}
