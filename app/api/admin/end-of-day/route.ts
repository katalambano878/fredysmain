import { NextResponse } from 'next/server';
import { requireAdminSession } from '@/lib/admin-route-auth';
import { isPlainPostgres } from '@/lib/db/mode';
import { query } from '@/lib/db/pool';
import { supabaseAdmin } from '@/lib/supabase-admin';

/** Ghana business day bounds in Africa/Accra (UTC+0, no DST). */
function dayBounds(dateStr?: string | null): { day: string; start: string; end: string } {
  const raw = (dateStr || '').trim();
  const day = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? raw
    : new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Accra' });
  return {
    day,
    start: `${day}T00:00:00+00:00`,
    end: `${day}T23:59:59.999+00:00`,
  };
}

function isPosMeta(metadata: any): boolean {
  return metadata?.pos_sale === true || metadata?.pos_sale === 'true';
}

/**
 * End-of-day report (v1 + v2).
 * GET /api/admin/end-of-day?date=YYYY-MM-DD
 */
export async function GET(request: Request) {
  const err = await requireAdminSession(request);
  if (err) return err;

  const { searchParams } = new URL(request.url);
  const { day, start, end } = dayBounds(searchParams.get('date'));
  const startedAt = Date.now();

  try {
    if (isPlainPostgres()) {
      const [totalsRes, payRes, productsRes, ordersRes, staffRes, compareRes, guestsRes] =
        await Promise.allSettled([
          query<any>(`
            SELECT
              COUNT(*) FILTER (WHERE payment_status = 'paid')::int AS paid_orders,
              COUNT(*) FILTER (WHERE payment_status IS DISTINCT FROM 'paid')::int AS unpaid_orders,
              COUNT(*) FILTER (WHERE payment_status = 'paid' AND (metadata->>'pos_sale') IN ('true','t'))::int AS pos_paid_orders,
              COUNT(*) FILTER (WHERE payment_status = 'paid' AND COALESCE(metadata->>'pos_sale','') NOT IN ('true','t'))::int AS web_paid_orders,
              COALESCE(SUM(total) FILTER (WHERE payment_status = 'paid'), 0)::float AS gross_paid,
              COALESCE(SUM(discount_total) FILTER (WHERE payment_status = 'paid'), 0)::float AS discounts,
              COALESCE(SUM(total) FILTER (WHERE payment_status = 'paid' AND (metadata->>'pos_sale') IN ('true','t')), 0)::float AS pos_revenue,
              COALESCE(SUM(total) FILTER (WHERE payment_status = 'paid' AND COALESCE(metadata->>'pos_sale','') NOT IN ('true','t')), 0)::float AS web_revenue,
              COUNT(*) FILTER (WHERE payment_status = 'paid' AND COALESCE(is_preorder,false) = true)::int AS preorder_paid,
              COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled_orders
            FROM orders
            WHERE created_at >= $1::timestamptz AND created_at <= $2::timestamptz
          `, [start, end]),
          query<{ payment_method: string; channel: string; orders: number; revenue: number }>(`
            SELECT
              COALESCE(NULLIF(payment_method, ''), 'unknown') AS payment_method,
              CASE WHEN (metadata->>'pos_sale') IN ('true','t') THEN 'pos' ELSE 'website' END AS channel,
              COUNT(*)::int AS orders,
              COALESCE(SUM(total), 0)::float AS revenue
            FROM orders
            WHERE created_at >= $1::timestamptz AND created_at <= $2::timestamptz
              AND payment_status = 'paid'
            GROUP BY 1, 2
            ORDER BY revenue DESC
          `, [start, end]),
          query<any>(`
            SELECT
              oi.product_id,
              COALESCE(oi.product_name, p.name, 'Unknown') AS product_name,
              COALESCE(oi.variant_name, '') AS variant_name,
              SUM(oi.quantity)::int AS units_sold,
              COALESCE(SUM(oi.total_price), 0)::float AS revenue,
              CASE WHEN BOOL_OR((o.metadata->>'pos_sale') IN ('true','t'))
                   AND BOOL_OR(COALESCE(o.metadata->>'pos_sale','') NOT IN ('true','t'))
                THEN 'both'
                WHEN BOOL_OR((o.metadata->>'pos_sale') IN ('true','t')) THEN 'pos'
                ELSE 'website'
              END AS channel,
              COALESCE(p.quantity, 0)::int AS stock_remaining,
              COALESCE(SUM(oi.quantity) FILTER (WHERE (o.metadata->>'pos_sale') IN ('true','t')), 0)::int AS pos_units,
              COALESCE(SUM(oi.quantity) FILTER (WHERE COALESCE(o.metadata->>'pos_sale','') NOT IN ('true','t')), 0)::int AS web_units
            FROM order_items oi
            INNER JOIN orders o ON o.id = oi.order_id
            LEFT JOIN products p ON p.id = oi.product_id
            WHERE o.created_at >= $1::timestamptz AND o.created_at <= $2::timestamptz
              AND o.payment_status = 'paid'
              AND o.status IS DISTINCT FROM 'cancelled'
            GROUP BY oi.product_id, COALESCE(oi.product_name, p.name, 'Unknown'), COALESCE(oi.variant_name, ''), p.quantity
            ORDER BY revenue DESC, units_sold DESC
            LIMIT 200
          `, [start, end]),
          query<any>(`
            SELECT
              id, order_number, email, phone, total, discount_total, payment_status,
              payment_method, status, shipping_method, created_at, is_preorder, staff_id, metadata
            FROM orders
            WHERE created_at >= $1::timestamptz AND created_at <= $2::timestamptz
            ORDER BY created_at DESC
            LIMIT 300
          `, [start, end]),
          query<{ staff_id: string; full_name: string; orders: number; revenue: number }>(`
            SELECT
              o.staff_id::text AS staff_id,
              COALESCE(pr.full_name, 'Staff') AS full_name,
              COUNT(*)::int AS orders,
              COALESCE(SUM(o.total), 0)::float AS revenue
            FROM orders o
            LEFT JOIN profiles pr ON pr.id = o.staff_id
            WHERE o.created_at >= $1::timestamptz AND o.created_at <= $2::timestamptz
              AND o.payment_status = 'paid'
              AND (o.metadata->>'pos_sale') IN ('true','t')
              AND o.staff_id IS NOT NULL
            GROUP BY o.staff_id, pr.full_name
            ORDER BY revenue DESC
            LIMIT 20
          `, [start, end]),
          query<any>(`
            SELECT
              COALESCE(SUM(total) FILTER (
                WHERE payment_status = 'paid'
                  AND created_at >= ($1::date - 1)::timestamptz
                  AND created_at < $1::timestamptz
              ), 0)::float AS yesterday_revenue,
              COUNT(*) FILTER (
                WHERE payment_status = 'paid'
                  AND created_at >= ($1::date - 1)::timestamptz
                  AND created_at < $1::timestamptz
              )::int AS yesterday_orders,
              COALESCE(SUM(total) FILTER (
                WHERE payment_status = 'paid'
                  AND created_at >= ($1::date - 7)::timestamptz
                  AND created_at < ($1::date - 6)::timestamptz
              ), 0)::float AS last_week_same_day_revenue,
              COUNT(*) FILTER (
                WHERE payment_status = 'paid'
                  AND created_at >= ($1::date - 7)::timestamptz
                  AND created_at < ($1::date - 6)::timestamptz
              )::int AS last_week_same_day_orders
            FROM orders
            WHERE created_at >= ($1::date - 8)::timestamptz
              AND created_at < ($1::date + 1)::timestamptz
          `, [day]),
          query<{ new_customers: number; guest_orders: number }>(`
            SELECT
              (SELECT COUNT(*)::int FROM customers
                 WHERE created_at >= $1::timestamptz AND created_at <= $2::timestamptz) AS new_customers,
              (SELECT COUNT(*)::int FROM orders
                 WHERE created_at >= $1::timestamptz AND created_at <= $2::timestamptz
                   AND payment_status = 'paid'
                   AND user_id IS NULL) AS guest_orders
          `, [start, end]),
        ]);

      const t = totalsRes.status === 'fulfilled' ? totalsRes.value.rows[0] || {} : {};
      const paidOrders = Number(t.paid_orders) || 0;
      const grossPaid = Number(t.gross_paid) || 0;
      const webRevenue = Number(t.web_revenue) || 0;
      const posRevenue = Number(t.pos_revenue) || 0;
      const compare = compareRes.status === 'fulfilled' ? compareRes.value.rows[0] || {} : {};
      const guest = guestsRes.status === 'fulfilled' ? guestsRes.value.rows[0] || {} : {};

      const products = productsRes.status === 'fulfilled' ? productsRes.value.rows : [];
      const lowStockAfter = products.filter((p: any) => Number(p.stock_remaining) < 10);

      const dayStrength =
        grossPaid <= 0 ? 'quiet' : grossPaid < Number(compare.yesterday_revenue || 0) * 0.7
          ? 'soft'
          : grossPaid > Number(compare.yesterday_revenue || 0) * 1.2
            ? 'strong'
            : 'good';

      const orders = (ordersRes.status === 'fulfilled' ? ordersRes.value.rows : []).map((o: any) => ({
        id: o.id,
        order_number: o.order_number,
        email: o.email,
        phone: o.phone,
        total: Number(o.total) || 0,
        discount_total: Number(o.discount_total) || 0,
        payment_status: o.payment_status,
        payment_method: o.payment_method,
        status: o.status,
        shipping_method: o.shipping_method,
        created_at: o.created_at,
        is_preorder: Boolean(o.is_preorder),
        channel: isPosMeta(o.metadata) ? 'pos' : 'website',
      }));

      return NextResponse.json({
        success: true,
        durationMs: Date.now() - startedAt,
        day,
        timezone: 'Africa/Accra',
        summary: {
          paidOrders,
          unpaidOrders: Number(t.unpaid_orders) || 0,
          cancelledOrders: Number(t.cancelled_orders) || 0,
          webPaidOrders: Number(t.web_paid_orders) || 0,
          posPaidOrders: Number(t.pos_paid_orders) || 0,
          grossPaid,
          discounts: Number(t.discounts) || 0,
          netPaid: Math.max(0, grossPaid), // totals already after discount in order.total
          webRevenue,
          posRevenue,
          aov: paidOrders > 0 ? grossPaid / paidOrders : 0,
          preorderPaid: Number(t.preorder_paid) || 0,
          pendingFulfillment: orders.filter(
            (o: any) =>
              o.payment_status === 'paid' &&
              !['delivered', 'cancelled', 'shipped'].includes(String(o.status))
          ).length,
          newCustomers: Number(guest.new_customers) || 0,
          guestPaidOrders: Number(guest.guest_orders) || 0,
          dayStrength,
        },
        comparison: {
          yesterdayRevenue: Number(compare.yesterday_revenue) || 0,
          yesterdayOrders: Number(compare.yesterday_orders) || 0,
          lastWeekSameDayRevenue: Number(compare.last_week_same_day_revenue) || 0,
          lastWeekSameDayOrders: Number(compare.last_week_same_day_orders) || 0,
        },
        payments: payRes.status === 'fulfilled' ? payRes.value.rows : [],
        products,
        lowStockAfterSale: lowStockAfter.slice(0, 30),
        staffPos: staffRes.status === 'fulfilled' ? staffRes.value.rows : [],
        orders,
      });
    }

    // Non-plain fallback (bounded)
    const { data: orders } = await supabaseAdmin
      .from('orders')
      .select(
        'id, order_number, email, phone, total, discount_total, payment_status, payment_method, status, shipping_method, created_at, is_preorder, staff_id, metadata'
      )
      .gte('created_at', start)
      .lte('created_at', end)
      .order('created_at', { ascending: false })
      .limit(300);

    const list = orders || [];
    const paid = list.filter((o: any) => o.payment_status === 'paid');
    const posPaid = paid.filter((o: any) => isPosMeta(o.metadata));
    const webPaid = paid.filter((o: any) => !isPosMeta(o.metadata));
    const grossPaid = paid.reduce((s: number, o: any) => s + (Number(o.total) || 0), 0);

    const paidIds = paid.map((o: any) => o.id);
    let items: any[] = [];
    for (let i = 0; i < paidIds.length; i += 100) {
      const chunk = paidIds.slice(i, i + 100);
      const { data } = await supabaseAdmin
        .from('order_items')
        .select('product_id, product_name, variant_name, quantity, total_price, order_id')
        .in('order_id', chunk);
      if (data) items = items.concat(data);
    }

    const productMap = new Map<string, any>();
    for (const it of items) {
      const key = `${it.product_id || it.product_name}|${it.variant_name || ''}`;
      const cur = productMap.get(key) || {
        product_id: it.product_id,
        product_name: it.product_name || 'Unknown',
        variant_name: it.variant_name || '',
        units_sold: 0,
        revenue: 0,
        pos_units: 0,
        web_units: 0,
        stock_remaining: null,
        channel: 'website',
      };
      const ord = paid.find((o: any) => o.id === it.order_id);
      const pos = ord ? isPosMeta(ord.metadata) : false;
      cur.units_sold += Number(it.quantity) || 0;
      cur.revenue += Number(it.total_price) || 0;
      if (pos) cur.pos_units += Number(it.quantity) || 0;
      else cur.web_units += Number(it.quantity) || 0;
      productMap.set(key, cur);
    }

    return NextResponse.json({
      success: true,
      durationMs: Date.now() - startedAt,
      day,
      timezone: 'Africa/Accra',
      summary: {
        paidOrders: paid.length,
        unpaidOrders: list.filter((o: any) => o.payment_status !== 'paid').length,
        cancelledOrders: list.filter((o: any) => o.status === 'cancelled').length,
        webPaidOrders: webPaid.length,
        posPaidOrders: posPaid.length,
        grossPaid,
        discounts: paid.reduce((s: number, o: any) => s + (Number(o.discount_total) || 0), 0),
        netPaid: grossPaid,
        webRevenue: webPaid.reduce((s: number, o: any) => s + (Number(o.total) || 0), 0),
        posRevenue: posPaid.reduce((s: number, o: any) => s + (Number(o.total) || 0), 0),
        aov: paid.length ? grossPaid / paid.length : 0,
        preorderPaid: paid.filter((o: any) => o.is_preorder).length,
        pendingFulfillment: paid.filter(
          (o: any) => !['delivered', 'cancelled', 'shipped'].includes(String(o.status))
        ).length,
        newCustomers: 0,
        guestPaidOrders: paid.filter((o: any) => !o.user_id).length,
        dayStrength: grossPaid > 0 ? 'good' : 'quiet',
      },
      comparison: {
        yesterdayRevenue: 0,
        yesterdayOrders: 0,
        lastWeekSameDayRevenue: 0,
        lastWeekSameDayOrders: 0,
      },
      payments: [],
      products: Array.from(productMap.values()).sort((a, b) => b.revenue - a.revenue),
      lowStockAfterSale: [],
      staffPos: [],
      orders: list.map((o: any) => ({
        ...o,
        channel: isPosMeta(o.metadata) ? 'pos' : 'website',
        total: Number(o.total) || 0,
      })),
    });
  } catch (e: any) {
    console.error('[end-of-day]', e?.message || e);
    return NextResponse.json(
      { success: false, error: { code: 'EOD_FAILED', message: e?.message || 'Failed' } },
      { status: 500 }
    );
  }
}
