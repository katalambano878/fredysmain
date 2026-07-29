import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { checkRateLimit, getClientIdentifier, RATE_LIMITS } from '@/lib/rate-limit';
import { asNumber } from '@/lib/format-money';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type IncomingItem = {
  product_id?: string;
  product_name?: string;
  variant_name?: string | null;
  quantity?: number;
  unit_price?: number;
  total_price?: number;
  is_preorder?: boolean;
  metadata?: Record<string, unknown> | null;
};

/**
 * Create order with server-trusted pricing from product/variant DB rows.
 * Client totals are ignored.
 */
export async function POST(req: Request) {
  try {
    const clientId = getClientIdentifier(req);
    const rateLimitResult = checkRateLimit(`create-order:${clientId}`, RATE_LIMITS.payment);
    if (!rateLimitResult.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const body = await req.json().catch(() => ({}));
    const orderData = body.orderData || {};
    const items: IncomingItem[] = Array.isArray(body.items) ? body.items : [];

    if (!items.length) {
      return NextResponse.json({ error: 'Invalid order data' }, { status: 400 });
    }
    if (!orderData.email || !orderData.phone) {
      return NextResponse.json({ error: 'Missing required order fields' }, { status: 400 });
    }

    const email = String(orderData.email).trim().toLowerCase();
    const phone = String(orderData.phone).trim();
    if (!email.includes('@') || phone.length < 9) {
      return NextResponse.json({ error: 'Invalid email or phone' }, { status: 400 });
    }

    // Resolve line items from DB (never trust client unit_price / total)
    const lineItems: Array<Record<string, unknown>> = [];
    let subtotal = 0;

    for (const raw of items) {
      const productId = String(raw.product_id || '');
      const qty = Math.max(1, Math.floor(asNumber(raw.quantity, 1)));
      if (!UUID_RE.test(productId)) {
        return NextResponse.json({ error: 'Invalid product in cart' }, { status: 400 });
      }
      if (qty > 100) {
        return NextResponse.json({ error: 'Quantity too high' }, { status: 400 });
      }

      const { data: product, error: pErr } = await supabaseAdmin
        .from('products')
        .select('id, name, price, quantity, status, slug, moq')
        .eq('id', productId)
        .single();

      if (pErr || !product) {
        return NextResponse.json({ error: 'Product not found' }, { status: 400 });
      }
      if (String(product.status || '').toLowerCase() !== 'active') {
        return NextResponse.json(
          { error: `Product unavailable: ${product.name}` },
          { status: 400 }
        );
      }

      const variantId =
        raw.metadata && typeof raw.metadata === 'object'
          ? String((raw.metadata as any).variant_id || '')
          : '';

      let unitPrice = asNumber(product.price);
      let variantName = raw.variant_name || null;
      let stock = asNumber(product.quantity);
      let resolvedVariantId: string | null = null;

      if (UUID_RE.test(variantId)) {
        const { data: variant } = await supabaseAdmin
          .from('product_variants')
          .select('id, price, quantity, name, option1, option2')
          .eq('id', variantId)
          .eq('product_id', productId)
          .maybeSingle();
        if (variant) {
          unitPrice = asNumber(variant.price, unitPrice);
          stock = asNumber(variant.quantity, stock);
          variantName =
            variant.name ||
            [variant.option1, variant.option2].filter(Boolean).join(' / ') ||
            variantName;
          resolvedVariantId = variant.id;
        }
      }

      const isPreorder = Boolean(raw.is_preorder);
      if (!isPreorder && stock < qty) {
        return NextResponse.json(
          { error: `Insufficient stock for ${product.name}` },
          { status: 400 }
        );
      }

      const lineTotal = unitPrice * qty;
      subtotal += lineTotal;

      const meta = {
        ...(raw.metadata && typeof raw.metadata === 'object' ? raw.metadata : {}),
        image: (raw.metadata as any)?.image || null,
        slug: (raw.metadata as any)?.slug || product.slug || null,
        is_preorder: isPreorder,
        ...(resolvedVariantId ? { variant_id: resolvedVariantId } : {}),
      };

      lineItems.push({
        product_id: product.id,
        product_name: product.name,
        variant_name: variantName,
        quantity: qty,
        unit_price: unitPrice,
        total_price: lineTotal,
        is_preorder: isPreorder,
        metadata: meta,
      });
    }

    // Shipping/tax: only accept non-negative numbers; clamp shipping to a sane max
    const shippingTotal = Math.min(500, Math.max(0, asNumber(orderData.shipping_total, 0)));
    const taxTotal = Math.min(subtotal, Math.max(0, asNumber(orderData.tax_total, 0)));
    const discountTotal = Math.min(subtotal, Math.max(0, asNumber(orderData.discount_total, 0)));
    const total = Math.max(0, subtotal + shippingTotal + taxTotal - discountTotal);

    const orderNumber =
      typeof orderData.order_number === 'string' && /^ORD-[\w-]+$/.test(orderData.order_number)
        ? orderData.order_number
        : `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const orderIsPreorder = lineItems.some((i) => Boolean(i.is_preorder));

    const insertPayload = {
      order_number: orderNumber,
      user_id: orderData.user_id && UUID_RE.test(String(orderData.user_id)) ? orderData.user_id : null,
      email,
      phone,
      status: 'pending',
      payment_status: 'pending',
      currency: 'GHS',
      subtotal,
      tax_total: taxTotal,
      shipping_total: shippingTotal,
      discount_total: discountTotal,
      total,
      shipping_method: orderData.shipping_method || 'pickup',
      payment_method: orderData.payment_method || 'hubtel',
      shipping_address: orderData.shipping_address || {},
      billing_address: orderData.billing_address || orderData.shipping_address || {},
      is_preorder: orderIsPreorder,
      metadata: {
        ...(orderData.metadata && typeof orderData.metadata === 'object' ? orderData.metadata : {}),
        guest_checkout: !orderData.user_id,
        server_priced: true,
        client_total_ignored: asNumber(orderData.total, 0),
      },
    };

    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .insert([insertPayload])
      .select('id, order_number, total, email')
      .single();

    if (orderError || !order) {
      console.error('[Create Order] Insert error:', orderError?.message);
      return NextResponse.json({ error: 'Failed to create order' }, { status: 500 });
    }

    const orderItems = lineItems.map((item) => ({ ...item, order_id: order.id }));
    const { error: itemsError } = await supabaseAdmin.from('order_items').insert(orderItems);

    if (itemsError) {
      console.error('[Create Order] Items insert error:', itemsError.message);
      await supabaseAdmin.from('orders').delete().eq('id', order.id);
      return NextResponse.json({ error: 'Failed to create order items' }, { status: 500 });
    }

    if (email) {
      try {
        const shipping = orderData.shipping_address || {};
        await supabaseAdmin.rpc('upsert_customer_from_order', {
          p_email: email,
          p_phone: phone,
          p_full_name: `${shipping.firstName || ''} ${shipping.lastName || ''}`.trim(),
          p_first_name: shipping.firstName || '',
          p_last_name: shipping.lastName || '',
          p_user_id: insertPayload.user_id,
          p_address: shipping || null,
        });
      } catch (e) {
        console.warn('[Create Order] Customer upsert failed (non-blocking):', e);
      }
    }

    return NextResponse.json({
      order: {
        id: order.id,
        order_number: order.order_number,
        total: order.total,
        email: order.email,
      },
    });
  } catch (err: any) {
    console.error('[Create Order] Error:', err.message);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
