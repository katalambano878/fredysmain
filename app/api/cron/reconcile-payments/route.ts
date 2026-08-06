import { NextResponse } from 'next/server';
import { reconcilePendingHubtelOrders } from '@/lib/payment-reconcile';

/**
 * Cron: check Hubtel for pending orders that were actually paid.
 * GET /api/cron/reconcile-payments
 * Authorization: Bearer CRON_SECRET
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const out = await reconcilePendingHubtelOrders({ days: 14, limit: 40 });
    console.log(
      `[cron/reconcile-payments] checked=${out.checked} markedPaid=${out.markedPaid}`
    );
    return NextResponse.json({ success: true, ...out });
  } catch (e: any) {
    console.error('[cron/reconcile-payments]', e?.message || e);
    return NextResponse.json({ success: false, error: e?.message || 'Failed' }, { status: 500 });
  }
}
