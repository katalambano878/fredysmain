import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdminSession } from '@/lib/admin-route-auth';

const CAMPAIGN_KEY = 'discount_campaign';

type Campaign = {
  active: boolean;
  type: 'percent' | 'fixed' | null;
  value: number | null;
  updated_at: string | null;
};

async function getCampaign(): Promise<Campaign> {
  const { data } = await supabaseAdmin
    .from('site_settings')
    .select('value')
    .eq('key', CAMPAIGN_KEY)
    .maybeSingle();

  const value = (data?.value || {}) as Partial<Campaign>;
  return {
    active: Boolean(value.active),
    type: value.type === 'percent' || value.type === 'fixed' ? value.type : null,
    value: typeof value.value === 'number' ? value.value : null,
    updated_at: typeof value.updated_at === 'string' ? value.updated_at : null,
  };
}

async function saveCampaign(campaign: Campaign) {
  const payload = {
    key: CAMPAIGN_KEY,
    value: campaign,
    category: 'promotions',
    updated_at: new Date().toISOString(),
  };

  const { data: existing } = await supabaseAdmin
    .from('site_settings')
    .select('id')
    .eq('key', CAMPAIGN_KEY)
    .maybeSingle();

  if (existing?.id) {
    await supabaseAdmin.from('site_settings').update(payload).eq('id', existing.id);
  } else {
    await supabaseAdmin.from('site_settings').insert([payload]);
  }
}

async function restoreAllDiscounts() {
  let restored = 0;
  let failed = 0;

  const { data: products, error: fetchError } = await supabaseAdmin
    .from('products')
    .select('id, price, compare_at_price')
    .not('compare_at_price', 'is', null);

  if (fetchError) throw new Error(fetchError.message);

  for (const product of products || []) {
    if (!product.compare_at_price || product.compare_at_price <= product.price) continue;
    const { error } = await supabaseAdmin
      .from('products')
      .update({ price: product.compare_at_price, compare_at_price: null })
      .eq('id', product.id);
    if (error) failed++;
    else restored++;
  }

  // Restore size/variant prices too (Frebys prices often live on variants)
  const { data: variants } = await supabaseAdmin
    .from('product_variants')
    .select('id, price, compare_at_price')
    .not('compare_at_price', 'is', null);

  for (const variant of variants || []) {
    if (!variant.compare_at_price || variant.compare_at_price <= variant.price) continue;
    const { error } = await supabaseAdmin
      .from('product_variants')
      .update({ price: variant.compare_at_price, compare_at_price: null })
      .eq('id', variant.id);
    if (error) failed++;
    else restored++;
  }

  return { restored, failed };
}

/**
 * GET — campaign state + currently discounted products
 */
export async function GET(request: NextRequest) {
  const authErr = await requireAdminSession(request);
  if (authErr) return authErr;

  const campaign = await getCampaign();

  const { data, error } = await supabaseAdmin
    .from('products')
    .select('id, name, price, compare_at_price, status, product_images(url)')
    .not('compare_at_price', 'is', null)
    .order('name');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const products = (data || [])
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

  // If products are discounted but campaign flag drifted, treat as active
  const active = campaign.active || products.length > 0;

  return NextResponse.json({
    campaign: { ...campaign, active },
    products,
  });
}

/**
 * POST — apply discount OR toggle sale off/on
 *
 * Apply: { product_ids, type, value }
 * Toggle: { action: 'toggle', active: boolean }
 */
export async function POST(req: NextRequest) {
  const authErr = await requireAdminSession(req);
  if (authErr) return authErr;

  try {
    const body = await req.json();

    // ── Master sale toggle ──────────────────────────────────────────────
    if (body.action === 'toggle') {
      const turnOn = body.active === true;

      if (!turnOn) {
        const { restored, failed } = await restoreAllDiscounts();
        await saveCampaign({
          active: false,
          type: null,
          value: null,
          updated_at: new Date().toISOString(),
        });
        return NextResponse.json({
          message: `Sale turned OFF. Restored original prices for ${restored} item(s).${failed ? ` ${failed} failed.` : ''}`,
          campaign: { active: false, type: null, value: null },
          restored,
        });
      }

      // Turn ON — enable sale mode (admin then applies %). Do not change prices yet.
      const prev = await getCampaign();
      const campaign: Campaign = {
        active: true,
        type: prev.type,
        value: prev.value,
        updated_at: new Date().toISOString(),
      };
      await saveCampaign(campaign);
      return NextResponse.json({
        message: 'Sale turned ON. Set the discount and apply it to products.',
        campaign,
      });
    }

    // ── Apply discount ──────────────────────────────────────────────────
    const { product_ids, type, value, all_products } = body;

    let ids: string[] = Array.isArray(product_ids) ? product_ids : [];
    if (all_products === true) {
      const { data: all, error } = await supabaseAdmin
        .from('products')
        .select('id')
        .eq('status', 'active');
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      ids = (all || []).map((p: any) => p.id);
    }

    if (ids.length === 0) {
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
      .in('id', ids);

    if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
    if (!products || products.length === 0) {
      return NextResponse.json({ error: 'No products found.' }, { status: 404 });
    }

    const updates: { id: string; name: string; original: number; discounted: number }[] = [];
    let failed = 0;
    let variantsUpdated = 0;

    for (const product of products) {
      const originalPrice =
        product.compare_at_price && product.compare_at_price > product.price
          ? product.compare_at_price
          : product.price;

      let discountedPrice: number;
      if (type === 'percent') {
        discountedPrice = +(originalPrice * (1 - value / 100)).toFixed(2);
      } else {
        discountedPrice = +(originalPrice - value).toFixed(2);
      }
      if (discountedPrice < 0) discountedPrice = 0;

      // Only rewrite base product price when it actually has a price
      if (originalPrice > 0) {
        const { error: updateError } = await supabaseAdmin
          .from('products')
          .update({ price: discountedPrice, compare_at_price: originalPrice })
          .eq('id', product.id);

        if (updateError) {
          failed++;
          console.error(`[discounts] failed to update ${product.id}:`, updateError);
          continue;
        }
        updates.push({
          id: product.id,
          name: product.name,
          original: originalPrice,
          discounted: discountedPrice,
        });
      } else {
        // Mark product as in campaign even if price is on variants only
        updates.push({
          id: product.id,
          name: product.name,
          original: 0,
          discounted: 0,
        });
      }

      // Discount variants (Age sizes, etc.)
      const { data: variants } = await supabaseAdmin
        .from('product_variants')
        .select('id, price, compare_at_price')
        .eq('product_id', product.id);

      for (const variant of variants || []) {
        const vOriginal =
          variant.compare_at_price && variant.compare_at_price > variant.price
            ? variant.compare_at_price
            : Number(variant.price) || 0;
        if (!(vOriginal > 0)) continue;

        const vDiscounted =
          type === 'percent'
            ? +(vOriginal * (1 - value / 100)).toFixed(2)
            : +Math.max(0, vOriginal - value).toFixed(2);

        const { error: vErr } = await supabaseAdmin
          .from('product_variants')
          .update({ price: vDiscounted, compare_at_price: vOriginal })
          .eq('id', variant.id);

        if (!vErr) variantsUpdated++;
      }
    }

    const campaign: Campaign = {
      active: true,
      type,
      value,
      updated_at: new Date().toISOString(),
    };
    await saveCampaign(campaign);

    return NextResponse.json({
      message: `Discount applied to ${updates.length} product(s)${variantsUpdated ? ` and ${variantsUpdated} size/variant(s)` : ''}.${failed ? ` ${failed} failed.` : ''}`,
      updated: updates,
      variants_updated: variantsUpdated,
      campaign,
    });
  } catch (err: any) {
    console.error('[discounts] unexpected error:', err);
    return NextResponse.json({ error: err?.message || 'Something went wrong.' }, { status: 500 });
  }
}

/**
 * DELETE — remove discount from selected products (restore original price)
 * Body: { product_ids: string[] }  OR  { all: true }
 */
export async function DELETE(req: NextRequest) {
  const authErr = await requireAdminSession(req);
  if (authErr) return authErr;

  try {
    const body = await req.json();
    const removeAll = body.all === true;
    const productIds: string[] = body.product_ids || [];

    if (!removeAll && productIds.length === 0) {
      return NextResponse.json({ error: 'Provide product_ids or set all: true.' }, { status: 400 });
    }

    if (removeAll) {
      const { restored, failed } = await restoreAllDiscounts();
      await saveCampaign({
        active: false,
        type: null,
        value: null,
        updated_at: new Date().toISOString(),
      });
      return NextResponse.json({
        message: `Restored original price for ${restored} item(s).${failed ? ` ${failed} failed.` : ''}`,
        restored,
      });
    }

    let restored = 0;
    let failed = 0;

    const { data: products, error: fetchError } = await supabaseAdmin
      .from('products')
      .select('id, price, compare_at_price')
      .in('id', productIds);

    if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });

    for (const product of products || []) {
      if (product.compare_at_price && product.compare_at_price > product.price) {
        const { error } = await supabaseAdmin
          .from('products')
          .update({ price: product.compare_at_price, compare_at_price: null })
          .eq('id', product.id);
        if (error) failed++;
        else restored++;
      }

      const { data: variants } = await supabaseAdmin
        .from('product_variants')
        .select('id, price, compare_at_price')
        .eq('product_id', product.id)
        .not('compare_at_price', 'is', null);

      for (const variant of variants || []) {
        if (!variant.compare_at_price || variant.compare_at_price <= variant.price) continue;
        const { error } = await supabaseAdmin
          .from('product_variants')
          .update({ price: variant.compare_at_price, compare_at_price: null })
          .eq('id', variant.id);
        if (error) failed++;
        else restored++;
      }
    }

    // If nothing left on sale, mark campaign inactive
    const { data: still } = await supabaseAdmin
      .from('products')
      .select('id')
      .not('compare_at_price', 'is', null)
      .limit(1);
    if (!still?.length) {
      await saveCampaign({
        active: false,
        type: null,
        value: null,
        updated_at: new Date().toISOString(),
      });
    }

    return NextResponse.json({
      message: `Restored original price for ${restored} item(s).${failed ? ` ${failed} failed.` : ''}`,
      restored,
    });
  } catch (err: any) {
    console.error('[discounts] unexpected error:', err);
    return NextResponse.json({ error: err?.message || 'Something went wrong.' }, { status: 500 });
  }
}
