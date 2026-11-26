import { NextResponse } from 'next/server';
import { requireAnyPermission } from '@/lib/admin-route-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

/** Money to two decimal places, never negative. */
function money(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round((n + Number.EPSILON) * 100) / 100 : 0;
}

/**
 * POST /api/admin/pos/orders
 * Create a POS order (and items) using service role so RLS does not block walk-in (user_id: null).
 */
export async function POST(request: Request) {
  const auth = await requireAnyPermission(request, ['pos']);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json();
    const {
      order_number,
      email,
      phone,
      status,
      payment_status,
      subtotal,
      discount_total,
      total,
      shipping_method,
      payment_method,
      shipping_address,
      billing_address,
      metadata,
      items,
      mark_paid,
    } = body;

    if (!order_number || total == null || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'Missing order_number, total, or items' }, { status: 400 });
    }

    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .insert({
        order_number,
        user_id: null,
        email: email || null,
        phone: phone || null,
        status: status || 'pending',
        payment_status: payment_status || 'pending',
        currency: 'GHS',
        subtotal: money(subtotal),
        tax_total: 0,
        shipping_total: 0,
        discount_total: money(discount_total),
        total: money(total),
        shipping_method: shipping_method || 'pickup',
        payment_method: payment_method || 'cash',
        shipping_address: shipping_address || {},
        billing_address: billing_address || {},
        metadata: metadata || {},
        staff_id: auth.userId,
      })
      .select()
      .single();

    if (orderError) {
      console.error('POS order insert error:', orderError);
      return NextResponse.json({ error: orderError.message }, { status: 500 });
    }

    const orderItems = items.map((item: any) => ({
      order_id: order.id,
      product_id: item.product_id,
      product_name: item.product_name,
      variant_name: item.variant_name || null,
      variant_id: item.variant_id || null,
      quantity: item.quantity,
      unit_price: money(item.unit_price),
      total_price: money(item.total_price),
      metadata: item.metadata || {},
    }));

    const { error: itemsError } = await supabaseAdmin.from('order_items').insert(orderItems);
    if (itemsError) {
      console.error('POS order_items insert error:', itemsError);
      // Take the half-made sale back out. Left in, every retry added another paid order
      // with no items and the day's takings counted it each time.
      await supabaseAdmin.from('orders').delete().eq('id', order.id);
      return NextResponse.json({ error: itemsError.message }, { status: 500 });
    }

    let warning: string | null = null;
    if (mark_paid && (payment_status === 'paid' || payment_method === 'cash' || payment_method === 'card')) {
      // The database helper reports a failure in its result; it does not throw.
      const { error: paidError } = await supabaseAdmin.rpc('mark_order_paid', {
        order_ref: order_number,
        moolre_ref: `POS-${(payment_method || 'cash').toUpperCase()}-${Date.now()}`,
      });
      if (paidError) {
        console.error('mark_order_paid error:', paidError);
        warning = 'The sale was saved, but stock was not reduced. Check the stock for these items.';
      }
      // POS sales are fulfilled immediately in-store — mark as delivered.
      // Note: the order_status enum does not have a "completed" value;
      // "delivered" is the correct terminal status for a walk-in sale.
      const { error: statusError } = await supabaseAdmin
        .from('orders')
        .update({ status: 'delivered' })
        .eq('order_number', order_number);
      if (statusError) console.error('POS status update error:', statusError);
    }

    return NextResponse.json({ order, warning });
  } catch (e: any) {
    console.error('POS orders API error:', e);
    return NextResponse.json({ error: e?.message || 'Internal error' }, { status: 500 });
  }
}
