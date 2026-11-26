import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { emailsMatch } from '@/lib/order-access';
import { findOutOfStock } from '@/lib/order-stock';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;

  try {
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId);

    let orderQuery = supabaseAdmin
      .from('orders')
      .select('*, order_items(id, product_id, product_name, variant_name, variant_id, quantity, unit_price, metadata, is_preorder)');

    let requiredEmail = '';
    if (isUUID) {
      orderQuery = orderQuery.eq('id', orderId);
    } else {
      requiredEmail = new URL(request.url).searchParams.get('email')?.trim().toLowerCase() || '';
      if (!requiredEmail || !requiredEmail.includes('@')) {
        return NextResponse.json({ error: 'Email is required' }, { status: 400 });
      }
      orderQuery = orderQuery.eq('order_number', orderId);
    }

    const { data: order, error: orderError } = await orderQuery.single();

    if (orderError || !order || (!isUUID && !emailsMatch(order.email, requiredEmail))) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Stock is counted on the size that was ordered.
    const outOfStockItems = await findOutOfStock(order.order_items);

    return NextResponse.json({
      order,
      stockValid: outOfStockItems.length === 0,
      outOfStockItems,
    });
  } catch (err: any) {
    console.error('[Pay API] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
