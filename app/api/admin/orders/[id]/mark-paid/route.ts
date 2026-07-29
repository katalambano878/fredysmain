import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdminSession } from '@/lib/admin-route-auth';

/**
 * Manually mark order paid via mark_order_paid RPC (stock + stats side effects).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const err = await requireAdminSession(request);
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

    const { error: rpcError } = await supabaseAdmin.rpc('mark_order_paid', {
      order_ref: order.order_number || order.id,
      moolre_ref: `manual-admin-${Date.now()}`,
    });

    if (rpcError) {
      // Fallback: still mark paid + flag metadata if RPC missing
      console.error('[mark-paid] RPC failed, falling back to update:', rpcError.message);
      const { error } = await supabaseAdmin
        .from('orders')
        .update({
          payment_status: 'paid',
          metadata: { manually_marked_paid: true, rpc_fallback: true },
        })
        .eq('id', id);
      if (error) throw error;
    } else {
      await supabaseAdmin
        .from('orders')
        .update({
          metadata: { manually_marked_paid: true },
        })
        .eq('id', id);
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
