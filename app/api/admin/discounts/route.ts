import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdminSession } from '@/lib/admin-route-auth';
import {
  MAX_PERCENT_OFF,
  percentPrice,
  pricedRows,
  round2,
  rowState,
  summarizeSale,
  withSale,
  withSwitch,
  withoutSale,
  type PriceRow,
  type RowPatch,
} from '@/lib/sale-pricing';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Admin Discounts.
 *
 *   GET                       the table: every product, its sale and its switch
 *   GET ?variants=<productId> one product's sizes, for the "Variant prices" editor
 *   POST { action: 'apply', mode: 'percentage', value: 1-99, productIds }
 *   POST { action: 'apply', mode: 'fixed', value: price, productIds }   products without sizes
 *   POST { action: 'variant_prices', productId, items: [{ variantId, price }] }
 *   POST { action: 'remove', productIds }
 *   POST { action: 'set_product_active', active, productIds }           one product's Live switch
 *   POST { action: 'set_active', active }                               the all-sales switch
 *
 * A sale that is on lives in `price` (sale price) and `compare_at_price` (regular price),
 * which is what the shop, checkout and POS already read. A sale that is off keeps its sale
 * price in `metadata.sale_price`. See lib/sale-pricing.ts.
 * Changing a sale keeps its switch where it was. A new sale starts on when the all-sales
 * switch is on, and off when it is off.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_IDS = 2000;
const PAGE = 500;
const SALES_ACTIVE_KEY = 'sales_active';
const PRODUCT_SELECT =
  'id, name, slug, status, price, compare_at_price, metadata, created_at, categories(name), product_images(url, position), product_variants(id, name, option1, option2, price, compare_at_price, metadata, sort_order)';

class ActionError extends Error {}

type Change = { table: 'products' | 'product_variants'; id: string; patch: RowPatch };

async function getSalesActive(): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('site_settings')
    .select('value')
    .eq('key', SALES_ACTIVE_KEY)
    .maybeSingle();
  // No row yet means sales have never been switched off.
  if (!data) return true;
  return data.value === true || data.value === 'true';
}

async function saveSalesActive(active: boolean) {
  const { data: existing } = await supabaseAdmin
    .from('site_settings')
    .select('id')
    .eq('key', SALES_ACTIVE_KEY)
    .maybeSingle();
  const payload = { key: SALES_ACTIVE_KEY, value: active, category: 'promotions', updated_at: new Date().toISOString() };
  const { error } = existing?.id
    ? await supabaseAdmin.from('site_settings').update(payload).eq('id', existing.id)
    : await supabaseAdmin.from('site_settings').insert([payload]);
  if (error) throw new ActionError(error.message);
}

async function loadProducts(ids?: string[]): Promise<any[]> {
  const rows: any[] = [];
  if (ids) {
    for (let i = 0; i < ids.length; i += 200) {
      const { data, error } = await supabaseAdmin.from('products').select(PRODUCT_SELECT).in('id', ids.slice(i, i + 200));
      if (error) throw new ActionError(error.message);
      rows.push(...(data || []));
    }
    return rows;
  }
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabaseAdmin
      .from('products')
      .select(PRODUCT_SELECT)
      .neq('status', 'archived')
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new ActionError(error.message);
    rows.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

/** One row of the table. */
function toRow(p: any) {
  const images = Array.isArray(p.product_images)
    ? [...p.product_images].sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))
    : [];
  const summary = summarizeSale(p);
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    status: p.status,
    category: p.categories?.name || 'Uncategorized',
    image: images[0]?.url || null,
    variantsCount: Array.isArray(p.product_variants) ? p.product_variants.length : 0,
    regular: summary.regular,
    sale: summary.sale,
    percentOff: summary.percentOff,
    hasSale: summary.hasSale,
    live: summary.live,
  };
}

/** Run a job for every item, a few at a time, so a big selection does not flood the database. */
async function inBatches<T>(items: T[], job: (item: T) => Promise<void>, size = 6) {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(job));
  }
}

async function saveChanges(changes: Change[]) {
  const now = new Date().toISOString();
  await inBatches(changes, async ({ table, id, patch }) => {
    const { error } = await supabaseAdmin
      .from(table)
      .update({
        price: patch.price,
        compare_at_price: patch.compare_at_price,
        metadata: patch.metadata,
        updated_at: now,
      })
      .eq('id', id);
    if (error) throw new ActionError(error.message);
  });
}

/** Apply one change to every priced row of a product (the product and each of its sizes). */
function changesFor(product: any, change: (row: PriceRow) => RowPatch | null): Change[] {
  const out: Change[] = [];
  for (const { row, isVariant } of pricedRows(product)) {
    const patch = change(row);
    if (patch) out.push({ table: isVariant ? 'product_variants' : 'products', id: String(row.id), patch });
  }
  return out;
}

function cleanIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter((v): v is string => typeof v === 'string' && UUID.test(v))));
}

function variantLabel(v: any): string {
  return [v.option2, v.option1 || v.name].filter(Boolean).join(' / ') || v.name || 'Option';
}

export async function GET(request: NextRequest) {
  const authErr = await requireAdminSession(request);
  if (authErr) return authErr;

  try {
    const variantsFor = request.nextUrl.searchParams.get('variants') || '';
    if (variantsFor) {
      if (!UUID.test(variantsFor)) return NextResponse.json({ error: 'Unknown product' }, { status: 400 });
      const [product] = await loadProducts([variantsFor]);
      if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 });
      const own = rowState(product);
      const variants = [...(product.product_variants || [])]
        .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map((v: any) => {
          const state = rowState(v);
          // A size without its own price sells at the product price and cannot take its own sale price.
          const ownPrice = state.regular > 0;
          return {
            id: v.id,
            label: variantLabel(v),
            regular: ownPrice ? state.regular : own.regular,
            sale: ownPrice ? state.sale : own.sale,
            live: ownPrice ? state.live : own.live,
            editable: ownPrice,
          };
        });
      return NextResponse.json({ variants });
    }

    const [products, salesActive] = await Promise.all([loadProducts(), getSalesActive()]);
    return NextResponse.json({ salesActive, products: products.map(toRow) });
  } catch (err) {
    console.error('[admin/discounts] load error:', err);
    const message = err instanceof ActionError ? err.message : 'Could not load products.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const authErr = await requireAdminSession(request);
  if (authErr) return authErr;

  const body = await request.json().catch(() => null);
  const action = String(body?.action || '');

  try {
    // The all-sales switch: every sale on, or every sale off, in one go.
    if (action === 'set_active') {
      const active = body?.active === true;
      const all = await loadProducts();
      const changes = all.flatMap((p) => changesFor(p, (row) => withSwitch(row, active)));
      await saveChanges(changes);
      await saveSalesActive(active);
      const changed = new Set(changes.map((c) => c.id)).size;
      return NextResponse.json({ success: true, action, active, changed });
    }

    // Each size of one product at its own sale price.
    if (action === 'variant_prices') {
      const productId = String(body?.productId || '');
      const rawItems: unknown[] = Array.isArray(body?.items) ? body.items : [];
      if (!UUID.test(productId) || rawItems.length === 0) {
        return NextResponse.json({ error: 'No variant prices provided' }, { status: 400 });
      }
      const [product] = await loadProducts([productId]);
      if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 });

      const wanted = new Map<string, number>();
      for (const item of rawItems as any[]) {
        const price = round2(Number(item?.price));
        if (UUID.test(String(item?.variantId)) && Number.isFinite(price) && price > 0) wanted.set(item.variantId, price);
      }
      const summary = summarizeSale(product);
      const live = summary.hasSale ? summary.live : await getSalesActive();
      const changes: Change[] = [];
      let skipped = 0;
      for (const v of product.product_variants || []) {
        const price = wanted.get(v.id);
        if (price == null) continue;
        const patch = withSale(v, price, live);
        if (patch) changes.push({ table: 'product_variants', id: v.id, patch });
        else skipped += 1;
      }
      if (changes.length === 0) {
        return NextResponse.json(
          { error: "A sale price must be lower than the variant's regular price." },
          { status: 400 }
        );
      }
      await saveChanges(changes);
      const products = (await loadProducts([productId])).map(toRow);
      return NextResponse.json({
        success: true,
        action,
        updated: changes.length,
        skipped,
        paused: live ? 0 : 1,
        products,
      });
    }

    const rawIds: unknown = body?.productIds;
    if (!Array.isArray(rawIds) || rawIds.length === 0) {
      return NextResponse.json({ error: 'No products selected' }, { status: 400 });
    }
    if (rawIds.length > MAX_IDS) {
      return NextResponse.json(
        { error: `Too many products in one request (max ${MAX_IDS}). Apply in smaller batches.` },
        { status: 400 }
      );
    }
    const productIds = cleanIds(rawIds);
    if (productIds.length === 0) return NextResponse.json({ error: 'No valid product IDs' }, { status: 400 });

    const products = await loadProducts(productIds);
    const done = async (extra: Record<string, unknown>) =>
      NextResponse.json({ success: true, action, ...extra, products: (await loadProducts(productIds)).map(toRow) });

    // One product's Live switch (or the selected products').
    if (action === 'set_product_active') {
      const active = body?.active === true;
      let changed = 0;
      const changes: Change[] = [];
      for (const p of products) {
        const forProduct = changesFor(p, (row) => withSwitch(row, active));
        if (forProduct.length) changed += 1;
        changes.push(...forProduct);
      }
      await saveChanges(changes);
      return done({ active, changed });
    }

    if (action === 'remove') {
      let changed = 0;
      const changes: Change[] = [];
      for (const p of products) {
        const forProduct = changesFor(p, withoutSale);
        if (forProduct.length) changed += 1;
        changes.push(...forProduct);
      }
      await saveChanges(changes);
      return done({ changed });
    }

    if (action !== 'apply') return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

    const mode = String(body?.mode || '');
    const value = Number(body?.value);
    if (mode !== 'percentage' && mode !== 'fixed') return NextResponse.json({ error: 'Invalid mode' }, { status: 400 });
    if (!Number.isFinite(value)) return NextResponse.json({ error: 'Invalid value' }, { status: 400 });
    if (mode === 'percentage' && (value < 1 || value > MAX_PERCENT_OFF)) {
      return NextResponse.json({ error: `Discount percent must be between 1 and ${MAX_PERCENT_OFF}` }, { status: 400 });
    }
    if (mode === 'fixed' && value <= 0) {
      return NextResponse.json({ error: 'Sale price must be greater than 0' }, { status: 400 });
    }

    const salesActive = await getSalesActive();
    let paused = 0;
    let changed = 0;
    const changes: Change[] = [];
    for (const p of products) {
      const summary = summarizeSale(p);
      const live = summary.hasSale ? summary.live : salesActive;
      const hasOptions = (p.product_variants || []).length > 0;
      // A fixed price fits one price only.
      if (mode === 'fixed' && hasOptions) continue;
      const forProduct = changesFor(p, (row) => {
        const price = mode === 'percentage' ? percentPrice(rowState(row).regular, value) : round2(value);
        return price == null ? null : withSale(row, price, live);
      });
      if (forProduct.length === 0) continue;
      changed += 1;
      if (!live) paused += 1;
      changes.push(...forProduct);
    }
    await saveChanges(changes);
    return done({ mode, changed, skipped: productIds.length - changed, paused });
  } catch (err) {
    console.error(`[admin/discounts] ${action} error:`, err);
    const message = err instanceof ActionError ? err.message : 'Failed to update sales';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
