import { supabaseAdmin } from '@/lib/supabase-admin';

type StockItem = {
  product_id?: string | null;
  product_name?: string | null;
  variant_name?: string | null;
  variant_id?: string | null;
  quantity?: number | string | null;
  is_preorder?: boolean | null;
  metadata?: { variant_id?: string; is_preorder?: boolean } | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const same = (a: unknown, b: unknown) =>
  String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();

/**
 * Lines of an order that cannot be fulfilled from stock, as messages for the shopper.
 *
 * Stock is counted on the size that was ordered. The checks used to read the product's own
 * quantity, which is 0 or stale for outfits stocked by size, so in-stock sizes were refused
 * at the payment step after the order had already been created.
 */
export async function findOutOfStock(items: StockItem[] | null | undefined): Promise<string[]> {
  const problems: string[] = [];
  for (const item of items || []) {
    if (!item?.product_id) continue;
    if (item.is_preorder === true || item.metadata?.is_preorder === true) continue;
    const wanted = Math.max(1, Math.floor(Number(item.quantity) || 1));

    const { data: product } = await supabaseAdmin
      .from('products')
      .select('name, quantity, status')
      .eq('id', item.product_id)
      .maybeSingle();
    const label = `${item.product_name || product?.name || 'An item'}${item.variant_name ? ` (${item.variant_name})` : ''}`;
    if (!product || (product.status && product.status !== 'active')) {
      problems.push(`${label} is no longer available`);
      continue;
    }

    const { data: variants } = await supabaseAdmin
      .from('product_variants')
      .select('id, name, option1, quantity')
      .eq('product_id', item.product_id);
    const sizes: any[] = Array.isArray(variants) ? variants : [];

    let available = Number(product.quantity) || 0;
    if (sizes.length > 0) {
      const variantId = String(item.variant_id || item.metadata?.variant_id || '');
      let matched = UUID.test(variantId) ? sizes.filter((v) => v.id === variantId) : [];
      if (matched.length === 0 && item.variant_name) {
        matched = sizes.filter((v) => same(v.name, item.variant_name) || same(v.option1, item.variant_name));
      }
      // No size could be identified: fall back to everything the product has across its sizes.
      const pool = matched.length > 0 ? matched : sizes;
      available = Math.max(0, ...pool.map((v) => Number(v.quantity) || 0));
      if (matched.length === 0) available = pool.reduce((sum, v) => sum + (Number(v.quantity) || 0), 0);
    }

    if (available < wanted) {
      problems.push(
        available <= 0 ? `${label} is out of stock` : `${label}: only ${available} left (you ordered ${wanted})`
      );
    }
  }
  return problems;
}
