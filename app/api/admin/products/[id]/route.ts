import { NextResponse } from 'next/server';
import { denyUnlessPermission } from '@/lib/admin-route-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { isPlainPostgres } from '@/lib/db/mode';
import { query } from '@/lib/db/pool';
import { syncProductCostOfProduction } from '@/lib/product-cop';

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

function absoluteMediaUrl(url: string | null | undefined): string {
  if (!url) return url as any;
  if (/^https?:\/\//i.test(url) || url.startsWith('data:')) return url;
  const base = (process.env.NEXT_PUBLIC_APP_URL || process.env.STORAGE_PUBLIC_URL || '').replace(/\/+$/, '');
  if (!base) return url;
  return url.startsWith('/') ? `${base}${url}` : `${base}/${url}`;
}

/**
 * GET /api/admin/products/[id]
 * Fetches a single product with variants and images using service role (bypasses RLS).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const err = await denyUnlessPermission(request, ['products']);
  if (err) return err;

  const { id: productId } = await params;
  if (!productId) {
    return NextResponse.json({ error: 'Missing product id' }, { status: 400 });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('products')
      .select(`
        *,
        categories(id, name),
        product_variants(*),
        product_images(*),
        product_cost_of_production (
          cop_description,
          fabric_cost,
          other_cost,
          labour_cost,
          gross_cost,
          per_variant_costs,
          production_staff_id,
          production_staff ( id, full_name )
        )
      `)
      .eq('id', productId)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message || 'Product not found' }, { status: 404 });
    }

    const product = {
      ...data,
      product_images: (Array.isArray(data.product_images) ? data.product_images : []).map((img: any) => ({
        ...img,
        url: img.url ? absoluteMediaUrl(img.url) : img.url,
      })),
    };

    return NextResponse.json({ product });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to fetch product' }, { status: 500 });
  }
}

/**
 * PUT /api/admin/products/[id]
 * Updates a product + replaces its variants using the service role (bypasses RLS).
 * Handles duplicate slug by appending a numeric suffix.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const err = await denyUnlessPermission(request, ['products']);
  if (err) return err;

  const { id: productId } = await params;
  if (!productId) {
    return NextResponse.json({ error: 'Missing product id' }, { status: 400 });
  }

  try {
    const body = await request.json();
    const { variants = [], cop, original_quantity, ...productData } = body;

    // Stock is never overwritten with what the form happened to load. The form sends the stock
    // it opened with next to the stock now in the box; only the difference is applied, to the
    // number in the database at this moment. A sale made while the editor was open stays sold.
    const stockAdjustments: { table: 'products' | 'product_variants'; id: string; delta: number }[] = [];
    const asWholeNumber = (value: unknown): number | null => {
      if (value === null || value === undefined || value === '') return null;
      const n = Number(value);
      return Number.isFinite(n) ? Math.trunc(n) : null;
    };
    const hasSizes = Array.isArray(variants) && variants.length > 0;
    if (hasSizes) {
      // The product's own number is the total of its sizes; it is worked out after they are saved.
      delete productData.quantity;
    } else {
      const loaded = asWholeNumber(original_quantity);
      const typed = asWholeNumber(productData.quantity) ?? 0;
      if (loaded !== null) {
        delete productData.quantity;
        if (typed !== loaded) stockAdjustments.push({ table: 'products', id: productId, delta: typed - loaded });
      }
      // No loaded value (an older copy of the form): the typed number is saved as before.
    }

    // Ensure slug uniqueness (ignore the current product)
    let slug: string = productData.slug || productData.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
    let slugCandidate = slug;
    let attempt = 1;
    while (true) {
      const { data: existing } = await supabaseAdmin
        .from('products')
        .select('id')
        .eq('slug', slugCandidate)
        .neq('id', productId)
        .maybeSingle();
      if (!existing) break;
      attempt++;
      slugCandidate = `${slug}-${attempt}`;
    }
    productData.slug = slugCandidate;

    // The form only knows its own metadata keys. Keep the rest (a switched-off sale price lives there).
    const { data: current } = await supabaseAdmin
      .from('products')
      .select('metadata')
      .eq('id', productId)
      .maybeSingle();
    const currentMeta =
      current?.metadata && typeof current.metadata === 'object' && !Array.isArray(current.metadata)
        ? current.metadata
        : {};
    productData.metadata = { ...currentMeta, ...(productData.metadata || {}) };

    const { error: updateError } = await supabaseAdmin
      .from('products')
      .update(productData)
      .eq('id', productId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    try {
      await syncProductCostOfProduction(productId, cop);
    } catch (copErr: any) {
      return NextResponse.json({ error: copErr?.message || 'Failed to save cost of production' }, { status: 500 });
    }

    // Sizes are updated in place, so each keeps its id. Carts and past orders point at that id,
    // and a size with order history cannot be deleted: the old delete-and-re-add left a second
    // copy of every sold size behind on each save.
    const { data: oldVariants, error: oldVariantsError } = await supabaseAdmin
      .from('product_variants')
      .select('id, name, option1, option2, price, compare_at_price, metadata, created_at')
      .eq('product_id', productId);
    if (oldVariantsError) {
      return NextResponse.json({ error: oldVariantsError.message }, { status: 500 });
    }
    const variantKey = (name: unknown, option2: unknown) =>
      `${String(name ?? '').trim().toLowerCase()}|${String(option2 ?? '').trim().toLowerCase()}`;
    const hasSaleState = (v: any) =>
      Number(v?.compare_at_price) > Number(v?.price) || Number(v?.metadata?.sale_price) > 0;
    const newerThan = (a: any, b: any) => String(a?.created_at || '') > String(b?.created_at || '');

    // One keeper per size. Where a size exists more than once, keep the copy with a sale, else the newest.
    const keeperByKey = new Map<string, any>();
    for (const v of oldVariants || []) {
      const key = variantKey(v.name || v.option1, v.option2);
      const current = keeperByKey.get(key);
      const better =
        !current ||
        (hasSaleState(v) && !hasSaleState(current)) ||
        (hasSaleState(v) === hasSaleState(current) && newerThan(v, current));
      if (better) keeperByKey.set(key, v);
    }

    const toUpdate: { id: string; values: Record<string, unknown> }[] = [];
    const toInsert: Record<string, unknown>[] = [];
    const usedKeeperIds = new Set<string>();
    variants.forEach((v: any, idx: number) => {
      const name = v.name || v.color || 'Default';
      const option2 = v.color?.trim() || null;
      const price = parseFloat(v.price) || 0;
      const candidate = keeperByKey.get(variantKey(name, option2));
      const old = candidate && !usedKeeperIds.has(candidate.id) ? candidate : null;
      const oldCompare = Number(old?.compare_at_price) || 0;
      const keptSalePrice = Number(old?.metadata?.sale_price) || 0;
      const metadata: Record<string, unknown> = v.colorHex ? { color_hex: v.colorHex } : {};
      // A switched-off sale price stays while it is still below the price.
      if (price > 0 && keptSalePrice > 0 && keptSalePrice < price) metadata.sale_price = keptSalePrice;
      const typedStock = parseInt(v.stock) || 0;
      const loadedStock = asWholeNumber(v.original_stock);
      // An existing size whose loaded stock is known: leave its stock alone, or move it by the
      // difference the admin typed. A new size, or an older copy of the form, saves the typed number.
      const stockByDifference = Boolean(old) && loadedStock !== null;
      if (old && stockByDifference && typedStock !== loadedStock) {
        stockAdjustments.push({ table: 'product_variants', id: old.id, delta: typedStock - (loadedStock as number) });
      }
      const values: Record<string, unknown> = {
        product_id: productId,
        name,
        sku: v.sku || null,
        price,
        // A live sale keeps its regular price while it is still above the price.
        compare_at_price: price > 0 && oldCompare > price ? oldCompare : null,
        ...(stockByDifference ? {} : { quantity: typedStock }),
        option1: v.name || null,
        option2,
        image_url: v.image_url?.trim() || null,
        sort_order: v.sort_order ?? idx,
        metadata,
      };
      if (old) {
        usedKeeperIds.add(old.id);
        toUpdate.push({ id: old.id, values });
      } else {
        toInsert.push(values);
      }
    });

    // Everything not kept goes: extra copies of a kept size, and sizes the admin removed.
    for (const v of oldVariants || []) {
      if (usedKeeperIds.has(v.id)) continue;
      const keeper = keeperByKey.get(variantKey(v.name || v.option1, v.option2));
      const replacement = keeper && usedKeeperIds.has(keeper.id) ? keeper.id : null;
      // Past orders keep their line (it stores the size name); it now points at the kept copy, or at no size.
      const { error: orderErr } = await supabaseAdmin
        .from('order_items')
        .update({ variant_id: replacement })
        .eq('variant_id', v.id);
      if (orderErr) return NextResponse.json({ error: orderErr.message }, { status: 500 });
      const cartChange = replacement
        ? supabaseAdmin.from('cart_items').update({ variant_id: replacement }).eq('variant_id', v.id)
        : supabaseAdmin.from('cart_items').delete().eq('variant_id', v.id);
      const { error: cartErr } = await cartChange;
      if (cartErr) return NextResponse.json({ error: cartErr.message }, { status: 500 });
      const { error: deleteErr } = await supabaseAdmin.from('product_variants').delete().eq('id', v.id);
      if (deleteErr) return NextResponse.json({ error: deleteErr.message }, { status: 500 });
    }

    for (const { id, values } of toUpdate) {
      const { error: updateVariantError } = await supabaseAdmin
        .from('product_variants')
        .update({ ...values, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (updateVariantError) {
        return NextResponse.json({ error: updateVariantError.message }, { status: 500 });
      }
    }

    // Insert in chunks of 100 to avoid payload limits
    const CHUNK = 100;
    for (let i = 0; i < toInsert.length; i += CHUNK) {
      const { error: varError } = await supabaseAdmin.from('product_variants').insert(toInsert.slice(i, i + CHUNK));
      if (varError) {
        return NextResponse.json({ error: varError.message }, { status: 500 });
      }
    }

    // Apply the stock differences to the numbers in the database right now.
    for (const { table, id, delta } of stockAdjustments) {
      if (isPlainPostgres()) {
        await query(
          `UPDATE ${table} SET quantity = GREATEST(0, COALESCE(quantity, 0) + $1), updated_at = now() WHERE id = $2`,
          [delta, id]
        );
      } else {
        const { data: row } = await supabaseAdmin.from(table).select('quantity').eq('id', id).maybeSingle();
        const { error: stockError } = await supabaseAdmin
          .from(table)
          .update({ quantity: Math.max(0, (Number(row?.quantity) || 0) + delta) })
          .eq('id', id);
        if (stockError) return NextResponse.json({ error: stockError.message }, { status: 500 });
      }
    }

    // A product sold by size holds the total of its sizes, read back after the changes above.
    if (hasSizes) {
      const { data: sizeRows, error: sizeError } = await supabaseAdmin
        .from('product_variants')
        .select('quantity')
        .eq('product_id', productId);
      if (sizeError) return NextResponse.json({ error: sizeError.message }, { status: 500 });
      const total = (sizeRows || []).reduce((sum: number, row: any) => sum + (Number(row.quantity) || 0), 0);
      const { error: totalError } = await supabaseAdmin.from('products').update({ quantity: total }).eq('id', productId);
      if (totalError) return NextResponse.json({ error: totalError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, slug: productData.slug });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to update product' }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/products/[id]
 * Deletes a product and its dependent rows (images, variants, cart/wishlist, reviews).
 * Fails with 400 if the product has order history.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const err = await denyUnlessPermission(request, ['products']);
  if (err) return err;

  const { id: productId } = await params;
  if (!productId) {
    return NextResponse.json({ error: 'Missing product id' }, { status: 400 });
  }

  try {
    const { data: orderItems } = await supabaseAdmin
      .from('order_items')
      .select('id')
      .eq('product_id', productId)
      .limit(1);
    if (orderItems && orderItems.length > 0) {
      return NextResponse.json(
        { error: 'Cannot delete product that has been ordered. Consider archiving it instead.' },
        { status: 400 }
      );
    }

    // Production logs feed the tailors' pay records and are removed with the product, so a
    // product that has any is kept. Archiving hides it from the shop without losing them.
    const { data: productionLogs, error: logsError } = await supabaseAdmin
      .from('production_logs')
      .select('id')
      .eq('product_id', productId)
      .limit(1);
    if (!logsError && productionLogs && productionLogs.length > 0) {
      return NextResponse.json(
        { error: 'This product has production records. Archive it instead of deleting it.' },
        { status: 400 }
      );
    }

    await supabaseAdmin.from('cart_items').delete().eq('product_id', productId);
    await supabaseAdmin.from('wishlist_items').delete().eq('product_id', productId);

    const { data: reviews } = await supabaseAdmin.from('reviews').select('id').eq('product_id', productId);
    if (reviews?.length) {
      const reviewIds = reviews.map((r: { id: string }) => r.id);
      await supabaseAdmin.from('review_images').delete().in('review_id', reviewIds);
      await supabaseAdmin.from('reviews').delete().eq('product_id', productId);
    }

    await supabaseAdmin.from('product_images').delete().eq('product_id', productId);
    await supabaseAdmin.from('product_variants').delete().eq('product_id', productId);

    const { error } = await supabaseAdmin.from('products').delete().eq('id', productId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to delete product' }, { status: 500 });
  }
}
