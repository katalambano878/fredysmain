import { supabaseAdmin } from '@/lib/supabase-admin';
import { trackMetaPurchaseServer } from '@/lib/meta-capi';

/**
 * Load order + line items and send Meta CAPI Purchase.
 * Safe to call from any payment success path; never throws.
 */
export async function fireMetaPurchaseForOrder(
  order: any,
  extras?: {
    fbp?: string | null;
    fbc?: string | null;
    clientIpAddress?: string | null;
    clientUserAgent?: string | null;
    eventSourceUrl?: string;
  }
) {
  try {
    if (!order) return;

    let orderItems = Array.isArray(order.order_items) ? order.order_items : null;
    if (!orderItems && order.id) {
      const { data } = await supabaseAdmin
        .from('order_items')
        .select('product_id, product_name, quantity, unit_price')
        .eq('order_id', order.id);
      orderItems = data || [];
    }

    await trackMetaPurchaseServer(
      { ...order, order_items: orderItems || [] },
      extras
    );
  } catch (e: any) {
    console.error('[Meta Purchase] Failed:', e?.message || e);
  }
}
