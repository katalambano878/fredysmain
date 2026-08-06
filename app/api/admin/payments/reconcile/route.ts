import { NextResponse } from 'next/server';
import { requireAdminSession } from '@/lib/admin-route-auth';
import { reconcilePendingHubtelOrders, reconcileHubtelOrder } from '@/lib/payment-reconcile';
import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * POST /api/admin/payments/reconcile
 * Body: { days?: number, limit?: number, orderNumber?: string }
 *
 * Checks Hubtel for unpaid orders that may already be paid at the gateway.
 */
export async function POST(request: Request) {
  const err = await requireAdminSession(request);
  if (err) return err;

  try {
    const body = await request.json().catch(() => ({}));
    const orderNumber =
      typeof body.orderNumber === 'string' && body.orderNumber.trim()
        ? body.orderNumber.trim()
        : null;

    if (orderNumber) {
      const { data: order, error } = await supabaseAdmin
        .from('orders')
        .select('id, order_number, payment_status, total, metadata, payment_method')
        .eq('order_number', orderNumber)
        .single();
      if (error || !order) {
        return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 });
      }
      const result = await reconcileHubtelOrder(order);
      return NextResponse.json({
        success: true,
        checked: 1,
        markedPaid: result.action === 'marked_paid' ? 1 : 0,
        results: [result],
      });
    }

    const days = Number(body.days) || 14;
    const limit = Number(body.limit) || 40;
    const out = await reconcilePendingHubtelOrders({ days, limit });
    return NextResponse.json({ success: true, ...out });
  } catch (e: any) {
    console.error('[reconcile]', e?.message || e);
    return NextResponse.json(
      { success: false, error: e?.message || 'Reconcile failed' },
      { status: 500 }
    );
  }
}

/** GET returns count of pending Hubtel candidates (no gateway calls). */
export async function GET(request: Request) {
  const err = await requireAdminSession(request);
  if (err) return err;

  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabaseAdmin
    .from('orders')
    .select('order_number, total, payment_status, payment_method, metadata, created_at')
    .neq('payment_status', 'paid')
    .gt('total', 0)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  const candidates = (data || []).filter((o: any) => {
    const gw = o.metadata?.payment_gateway || o.payment_method || '';
    return (
      String(gw).toLowerCase().includes('hubtel') ||
      Boolean(o.metadata?.hubtel_client_reference)
    );
  });

  return NextResponse.json({
    success: true,
    pendingHubtel: candidates.length,
    orders: candidates.map((o: any) => ({
      order_number: o.order_number,
      total: o.total,
      created_at: o.created_at,
      hubtel_ref: o.metadata?.hubtel_client_reference || null,
    })),
  });
}
