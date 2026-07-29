import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { checkRateLimit, getClientIdentifier, RATE_LIMITS } from '@/lib/rate-limit';

/**
 * Order lookup requires matching email (ownership gate).
 * Body: { orderId, email, includeItems? }
 */
export async function POST(req: Request) {
  try {
    const clientId = getClientIdentifier(req);
    const rateLimitResult = checkRateLimit(`order-lookup:${clientId}`, RATE_LIMITS.payment);
    if (!rateLimitResult.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const body = await req.json().catch(() => ({}));
    const orderId = typeof body.orderId === 'string' ? body.orderId.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const includeItems = Boolean(body.includeItems);

    if (!orderId) {
      return NextResponse.json({ error: 'Missing orderId' }, { status: 400 });
    }
    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Email is required to look up an order' }, { status: 400 });
    }

    const isUUID =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId);
    const selectFields = includeItems
      ? 'id, order_number, email, phone, total, subtotal, shipping_total, discount_total, status, payment_status, shipping_address, metadata, created_at, order_items(*)'
      : 'id, order_number, email, total, subtotal, shipping_total, discount_total, status, payment_status, shipping_address, metadata, created_at';

    let query = supabaseAdmin.from('orders').select(selectFields).ilike('email', email);
    const { data: order, error } = isUUID
      ? await query.eq('id', orderId).maybeSingle()
      : await query.eq('order_number', orderId).maybeSingle();

    if (error || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    return NextResponse.json({ order });
  } catch (err: any) {
    console.error('[Order Lookup] Error:', err.message);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
