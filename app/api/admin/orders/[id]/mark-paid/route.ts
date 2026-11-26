import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { denyUnlessPermission } from '@/lib/admin-route-auth';
import { mergeOrderMetadata } from '@/lib/order-metadata';
import { fireMetaPurchaseForOrder } from '@/lib/meta-purchase';

/**
 * Manually mark order paid via mark_order_paid RPC (stock + stats side effects).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // Orders, and Preorders too: its screen records a deposit order's balance as paid.
  const err = await denyUnlessPermission(request, ['orders', 'preorders']);
  if (err) return err;

  const { id } = await params;

  try {
    const { data: order, error: fetchError } = await supabaseAdmin
      .from('orders')
      .select('id, order_number, payment_status')
      .eq('id', id)
      .single();

    if (fetchError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    if (order.payment_status === 'paid') {
      return NextResponse.json({ success: true, alreadyPaid: true });
    }

    const { data: paidOrder, error: rpcError } = await supabaseAdmin.rpc('mark_order_paid', {
      order_ref: order.order_number || order.id,
      moolre_ref: `manual-admin-${Date.now()}`,
    });

    if (rpcError) {
      // Fallback: still mark paid + flag metadata if RPC missing
      console.error('[mark-paid] RPC failed, falling back to update:', rpcError.message);
      const { error } = await mergeOrderMetadata(
        { id },
        { manually_marked_paid: true, rpc_fallback: true },
        { payment_status: 'paid' }
      );
      if (error) throw new Error(error);
    } else {
      // Added to what marking the order paid just recorded, never in place of it.
      // Nothing is owed any more, so a preorder's recorded balance is cleared with it.
      await mergeOrderMetadata(
        { id },
        { manually_marked_paid: true, balance_due: 0, paid_in_full_at: new Date().toISOString() }
      );
    }

    const { data: fullOrder } = await supabaseAdmin
      .from('orders')
      .select('id, order_number, email, phone, total, shipping_address, metadata')
      .eq('id', id)
      .single();
    void fireMetaPurchaseForOrder(paidOrder || fullOrder);

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
