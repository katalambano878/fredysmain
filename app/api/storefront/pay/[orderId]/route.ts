import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;

  try {
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId);

    let orderQuery = supabaseAdmin
      .from('orders')
      .select('*, order_items(id, product_id, product_name, variant_name, quantity, unit_price, metadata, is_preorder)');

    if (isUUID) {
      orderQuery = orderQuery.eq('id', orderId);
    } else {
      const email = new URL(request.url).searchParams.get('email')?.trim().toLowerCase() || '';
      if (!email || !email.includes('@')) {
        return NextResponse.json({ error: 'Email is required' }, { status: 400 });
      }
      orderQuery = orderQuery.eq('order_number', orderId).ilike('email', email);
    }

    const { data: order, error: orderError } = await orderQuery.single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Validate stock for every item in the order
    const outOfStockItems: string[] = [];

    if (order.order_items?.length) {
      for (const item of order.order_items) {
        if (!item.product_id) continue;

        // Preorder items bypass stock validation
        if (item.is_preorder === true || item.metadata?.is_preorder === true) continue;

        // Fetch current product stock
        const { data: product } = await supabaseAdmin
          .from('products')
          .select('quantity, status, name')
          .eq('id', item.product_id)
          .single();

        if (!product) {
          outOfStockItems.push(item.product_name || 'Unknown product');
          continue;
        }

        // Product is inactive / deleted
        if (product.status && product.status !== 'active') {
          outOfStockItems.push(item.product_name);
          continue;
        }

        // Check variant stock if variant metadata is available
        const variantId = item.metadata?.variant_id;
        if (variantId) {
          const { data: variant } = await supabaseAdmin
            .from('product_variants')
            .select('quantity')
            .eq('id', variantId)
            .single();

          if (variant && typeof variant.quantity === 'number' && variant.quantity < item.quantity) {
            outOfStockItems.push(`${item.product_name}${item.variant_name ? ` (${item.variant_name})` : ''}`);
            continue;
          }
        }

        // Check overall product stock
        if (typeof product.quantity === 'number' && product.quantity < item.quantity) {
          outOfStockItems.push(item.product_name);
        }
      }
    }

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
