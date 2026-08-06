import { supabaseAdmin } from '@/lib/supabase-admin';
import { checkHubtelStatus, isHubtelPaid, isHubtelFailure } from '@/lib/hubtel';
import { sendOrderConfirmation } from '@/lib/notifications';
import { fireMetaPurchaseForOrder } from '@/lib/meta-purchase';

export type ReconcileItemResult = {
  orderNumber: string;
  action: 'marked_paid' | 'still_pending' | 'failed_at_gateway' | 'amount_mismatch' | 'skipped' | 'error';
  hubtelStatus?: string | null;
  message: string;
  total?: number;
};

function amountsMatch(expected: number, settlement: number | null, customerPaid: number | null): boolean {
  if (settlement !== null && Math.abs(settlement - expected) <= 0.01) return true;
  if (customerPaid !== null && Math.abs(customerPaid - expected) <= 0.01) return true;
  // Customer-side fees: allow small surcharge above order total when settlement missing
  if (
    customerPaid !== null &&
    customerPaid >= expected &&
    customerPaid - expected <= Math.max(5, expected * 0.05)
  ) {
    return true;
  }
  return false;
}

async function markPaid(orderNumber: string, gatewayRef: string) {
  const { data: orderJson, error } = await supabaseAdmin.rpc('mark_order_paid', {
    order_ref: orderNumber,
    moolre_ref: gatewayRef,
  });
  if (error) throw new Error(error.message);
  if (!orderJson) throw new Error('mark_order_paid returned empty');

  try {
    if (orderJson.email) {
      await supabaseAdmin.rpc('update_customer_stats', {
        p_customer_email: orderJson.email,
        p_order_total: orderJson.total,
      });
    }
  } catch {
    /* non-fatal */
  }

  try {
    await sendOrderConfirmation(orderJson);
  } catch {
    /* non-fatal */
  }

  void fireMetaPurchaseForOrder(orderJson);
  return orderJson;
}

/**
 * Ask Hubtel whether a single pending order is actually paid, and mark it if so.
 */
export async function reconcileHubtelOrder(order: {
  order_number: string;
  total: number | string;
  payment_status: string;
  metadata?: any;
}): Promise<ReconcileItemResult> {
  const orderNumber = order.order_number;
  const expected = Number(order.total) || 0;

  if (order.payment_status === 'paid') {
    return { orderNumber, action: 'skipped', message: 'Already paid', total: expected };
  }

  if (!(expected > 0)) {
    return { orderNumber, action: 'skipped', message: 'Invalid order total', total: expected };
  }

  const hubtelRef =
    order.metadata?.hubtel_client_reference ||
    order.metadata?.hubtel_balance_reference ||
    orderNumber;

  try {
    const status = await checkHubtelStatus(String(hubtelRef));
    const sStatus = String(status?.data?.status || '').toLowerCase();
    const settlementRaw = status?.data?.amountAfterCharges ?? null;
    const customerRaw = status?.data?.amount ?? null;
    const settlement =
      settlementRaw !== null && settlementRaw !== undefined
        ? parseFloat(String(settlementRaw))
        : null;
    const customerPaid =
      customerRaw !== null && customerRaw !== undefined ? parseFloat(String(customerRaw)) : null;

    if (isHubtelFailure(sStatus, status?.responseCode)) {
      await supabaseAdmin
        .from('orders')
        .update({
          metadata: {
            ...(order.metadata || {}),
            hubtel_last_reconcile_at: new Date().toISOString(),
            hubtel_last_status: sStatus,
            hubtel_last_response_code: status?.responseCode || null,
          },
        })
        .eq('order_number', orderNumber);

      return {
        orderNumber,
        action: 'failed_at_gateway',
        hubtelStatus: sStatus,
        message: `Hubtel status: ${sStatus || 'failed'}`,
        total: expected,
      };
    }

    if (!isHubtelPaid(sStatus, status?.responseCode)) {
      await supabaseAdmin
        .from('orders')
        .update({
          metadata: {
            ...(order.metadata || {}),
            hubtel_last_reconcile_at: new Date().toISOString(),
            hubtel_last_status: sStatus || 'unpaid',
            hubtel_last_response_code: status?.responseCode || null,
          },
        })
        .eq('order_number', orderNumber);

      return {
        orderNumber,
        action: 'still_pending',
        hubtelStatus: sStatus || 'unpaid',
        message: `Hubtel has not confirmed payment (${sStatus || 'unpaid/pending'})`,
        total: expected,
      };
    }

    if (!amountsMatch(expected, Number.isFinite(settlement as number) ? settlement : null, Number.isFinite(customerPaid as number) ? customerPaid : null)) {
      return {
        orderNumber,
        action: 'amount_mismatch',
        hubtelStatus: sStatus,
        message: `Amount mismatch. Expected ${expected}, settlement ${settlement}, customer ${customerPaid}`,
        total: expected,
      };
    }

    const gatewayRef =
      status?.data?.transactionId ||
      order.metadata?.hubtel_checkout_id ||
      `hubtel-reconcile-${Date.now()}`;

    await markPaid(orderNumber, String(gatewayRef));

    await supabaseAdmin
      .from('orders')
      .update({
        metadata: {
          ...(order.metadata || {}),
          hubtel_reconciled_at: new Date().toISOString(),
          hubtel_last_status: sStatus,
          payment_gateway: 'hubtel',
        },
      })
      .eq('order_number', orderNumber);

    return {
      orderNumber,
      action: 'marked_paid',
      hubtelStatus: sStatus,
      message: 'Confirmed paid at Hubtel and marked paid in store',
      total: expected,
    };
  } catch (e: any) {
    return {
      orderNumber,
      action: 'error',
      message: e?.message || 'Reconcile failed',
      total: expected,
    };
  }
}

/**
 * Scan recent unpaid Hubtel orders and reconcile against Hubtel status API.
 */
export async function reconcilePendingHubtelOrders(options?: {
  days?: number;
  limit?: number;
  orderNumbers?: string[];
}): Promise<{ checked: number; markedPaid: number; results: ReconcileItemResult[] }> {
  const days = Math.min(60, Math.max(1, options?.days ?? 14));
  const limit = Math.min(100, Math.max(1, options?.limit ?? 40));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  let query = supabaseAdmin
    .from('orders')
    .select('id, order_number, payment_status, total, metadata, payment_method, created_at')
    .neq('payment_status', 'paid')
    .gt('total', 0)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (options?.orderNumbers?.length) {
    query = supabaseAdmin
      .from('orders')
      .select('id, order_number, payment_status, total, metadata, payment_method, created_at')
      .in('order_number', options.orderNumbers)
      .limit(limit);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const candidates = (data || []).filter((o: any) => {
    const gw = o.metadata?.payment_gateway || o.payment_method || '';
    return (
      String(gw).toLowerCase().includes('hubtel') ||
      Boolean(o.metadata?.hubtel_client_reference)
    );
  });

  const results: ReconcileItemResult[] = [];
  let markedPaid = 0;

  for (const order of candidates) {
    const result = await reconcileHubtelOrder(order);
    results.push(result);
    if (result.action === 'marked_paid') markedPaid += 1;
    // Small delay to avoid hammering Hubtel
    await new Promise((r) => setTimeout(r, 250));
  }

  return { checked: candidates.length, markedPaid, results };
}
