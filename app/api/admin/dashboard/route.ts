import { NextResponse } from 'next/server';
import { requireAdminSession } from '@/lib/admin-route-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { isPlainPostgres } from '@/lib/db/mode';
import { query } from '@/lib/db/pool';

/**
 * Lightweight admin dashboard aggregates.
 * Never loads the full orders table into the browser.
 */
export async function GET(request: Request) {
  const err = await requireAdminSession(request);
  if (err) return err;

  const started = Date.now();

  try {
    if (isPlainPostgres()) {
      const [statsRes, chartRes, recentRes, lowStockRes, productsRes] = await Promise.allSettled([
        query<{
          total_orders: number;
          paid_orders: number;
          total_revenue: number;
          unique_customers: number;
        }>(`
          SELECT
            COUNT(*)::int AS total_orders,
            COUNT(*) FILTER (WHERE payment_status = 'paid')::int AS paid_orders,
            COALESCE(SUM(total) FILTER (WHERE payment_status = 'paid'), 0)::float AS total_revenue,
            COUNT(DISTINCT NULLIF(LOWER(TRIM(email)), ''))::int AS unique_customers
          FROM orders
        `),
        query<{ day: string; revenue: number }>(`
          SELECT
            (created_at AT TIME ZONE 'UTC')::date::text AS day,
            COALESCE(SUM(total), 0)::float AS revenue
          FROM orders
          WHERE payment_status = 'paid'
            AND created_at >= (NOW() - INTERVAL '7 days')
          GROUP BY 1
          ORDER BY 1 ASC
        `),
        query<any>(`
          SELECT id, order_number, email, created_at, total, status, shipping_address
          FROM orders
          WHERE payment_status = 'paid'
          ORDER BY created_at DESC
          LIMIT 5
        `),
        query<{ name: string; quantity: number }>(`
          SELECT name, quantity
          FROM products
          WHERE quantity < 10
          ORDER BY quantity ASC
          LIMIT 5
        `),
        query<any>(`
          SELECT p.id, p.slug, p.name, p.quantity,
            (
              SELECT pi.url FROM product_images pi
              WHERE pi.product_id = p.id
              ORDER BY pi.position NULLS LAST
              LIMIT 1
            ) AS image_url
          FROM products p
          WHERE p.status = 'active'
          ORDER BY p.updated_at DESC NULLS LAST, p.created_at DESC NULLS LAST
          LIMIT 4
        `),
      ]);

      const statsRow = statsRes.status === 'fulfilled' ? statsRes.value.rows[0] : null;
      const totalRevenue = Number(statsRow?.total_revenue) || 0;
      const paidOrders = Number(statsRow?.paid_orders) || 0;
      const totalOrders = Number(statsRow?.total_orders) || 0;
      const uniqueCustomers = Number(statsRow?.unique_customers) || 0;
      const avgOrderValue = paidOrders > 0 ? totalRevenue / paidOrders : 0;

      const last7Days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        return d.toISOString().split('T')[0];
      });
      const chartMap: Record<string, number> = {};
      for (const day of last7Days) chartMap[day] = 0;
      if (chartRes.status === 'fulfilled') {
        for (const row of chartRes.value.rows) {
          if (row.day in chartMap) chartMap[row.day] = Number(row.revenue) || 0;
        }
      }

      return NextResponse.json({
        success: true,
        durationMs: Date.now() - started,
        stats: {
          totalRevenue,
          totalOrders,
          uniqueCustomers,
          avgOrderValue,
          paidOrders,
        },
        chart: Object.keys(chartMap).map((date) => ({
          date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          revenue: chartMap[date],
        })),
        recentOrders: recentRes.status === 'fulfilled' ? recentRes.value.rows : [],
        lowStock: lowStockRes.status === 'fulfilled' ? lowStockRes.value.rows : [],
        topProducts: productsRes.status === 'fulfilled'
          ? productsRes.value.rows.map((p) => ({
              id: p.slug || p.id,
              name: p.name,
              image: p.image_url || '/frebys-logo.png',
              sales: 0,
              revenue: 0,
              stock: p.quantity,
            }))
          : [],
        sections: {
          stats: statsRes.status === 'fulfilled',
          chart: chartRes.status === 'fulfilled',
          recentOrders: recentRes.status === 'fulfilled',
          lowStock: lowStockRes.status === 'fulfilled',
          topProducts: productsRes.status === 'fulfilled',
        },
      });
    }

    // Legacy hosted Supabase path — still bounded (no full-table dump)
    const since = new Date();
    since.setDate(since.getDate() - 90);

    const [ordersRes, recentRes, lowStockRes, productRes] = await Promise.allSettled([
      supabaseAdmin
        .from('orders')
        .select('total, payment_status, created_at, email')
        .gte('created_at', since.toISOString())
        .limit(5000),
      supabaseAdmin
        .from('orders')
        .select('id, order_number, email, created_at, total, status, shipping_address')
        .eq('payment_status', 'paid')
        .order('created_at', { ascending: false })
        .limit(5),
      supabaseAdmin.from('products').select('name, quantity').lt('quantity', 10).limit(5),
      supabaseAdmin.from('products').select('id, slug, name, quantity, product_images(url)').limit(4),
    ]);

    const allOrders =
      ordersRes.status === 'fulfilled' ? ordersRes.value.data || [] : [];
    const paidOrders = allOrders.filter((o: any) => o.payment_status === 'paid');
    const totalRevenue = paidOrders.reduce((s: number, o: any) => s + (Number(o.total) || 0), 0);
    const uniqueCustomers = new Set(allOrders.map((o: any) => o.email).filter(Boolean)).size;

    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return d.toISOString().split('T')[0];
    });
    const chartMap: Record<string, number> = {};
    for (const day of last7Days) chartMap[day] = 0;
    paidOrders.forEach((order: any) => {
      const date = new Date(order.created_at).toISOString().split('T')[0];
      if (chartMap[date] !== undefined) chartMap[date] += Number(order.total) || 0;
    });

    return NextResponse.json({
      success: true,
      durationMs: Date.now() - started,
      stats: {
        totalRevenue,
        totalOrders: allOrders.length,
        uniqueCustomers,
        avgOrderValue: paidOrders.length ? totalRevenue / paidOrders.length : 0,
        paidOrders: paidOrders.length,
      },
      chart: Object.keys(chartMap).map((date) => ({
        date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        revenue: chartMap[date],
      })),
      recentOrders: recentRes.status === 'fulfilled' ? recentRes.value.data || [] : [],
      lowStock: lowStockRes.status === 'fulfilled' ? lowStockRes.value.data || [] : [],
      topProducts:
        productRes.status === 'fulfilled'
          ? (productRes.value.data || []).map((p: any) => ({
              id: p.slug || p.id,
              name: p.name,
              image: p.product_images?.[0]?.url || '/frebys-logo.png',
              sales: 0,
              revenue: 0,
              stock: p.quantity,
            }))
          : [],
      sections: {
        stats: ordersRes.status === 'fulfilled',
        chart: ordersRes.status === 'fulfilled',
        recentOrders: recentRes.status === 'fulfilled',
        lowStock: lowStockRes.status === 'fulfilled',
        topProducts: productRes.status === 'fulfilled',
      },
    });
  } catch (e: any) {
    console.error('[admin/dashboard]', e?.message || e);
    return NextResponse.json(
      { success: false, error: { code: 'DASHBOARD_FAILED', message: e?.message || 'Failed' } },
      { status: 500 }
    );
  }
}
