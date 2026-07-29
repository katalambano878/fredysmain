import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * GET /api/storefront/orders/[orderNumber]?email=
 * Requires email match to prevent order PII enumeration.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ orderNumber: string }> }
) {
  const { orderNumber } = await params;
  const email = new URL(request.url).searchParams.get('email')?.trim().toLowerCase() || '';

  if (!orderNumber) {
    return NextResponse.json({ error: 'Order number required' }, { status: 400 });
  }
  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 });
  }

  try {
    const { data: order, error } = await supabaseAdmin
      .from('orders')
      .select('*, order_items(*)')
      .eq('order_number', orderNumber)
      .ilike('email', email)
      .maybeSingle();

    if (error || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    return NextResponse.json({ order });
  } catch (e: any) {
    console.error('Order fetch error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
