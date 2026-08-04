import { NextResponse } from 'next/server';
import { requireAdminSession } from '@/lib/admin-route-auth';
import { isPlainPostgres } from '@/lib/db/mode';
import { query } from '@/lib/db/pool';
import { supabaseAdmin } from '@/lib/supabase-admin';

function rangeStart(timeRange: string): Date {
  const now = new Date();
  const start = new Date(now);
  if (timeRange === '7days') start.setDate(now.getDate() - 7);
  else if (timeRange === '90days') start.setDate(now.getDate() - 90);
  else if (timeRange === 'year') start.setFullYear(now.getFullYear(), 0, 1);
  else start.setDate(now.getDate() - 30); // default 30days
  return start;
}

/**
 * Server-side analytics — never dumps all order_items into the browser.
 * GET /api/admin/analytics?range=30days
 */
export async function GET(request: Request) {
  const err = await requireAdminSession(request);
  if (err) return err;

  const { searchParams } = new URL(request.url);
  const timeRange = searchParams.get('range') || '30days';
  const start = rangeStart(timeRange);
  const isoStart = start.toISOString();
  const started = Date.now();

  try {
    if (isPlainPostgres()) {
      const [metricsRes, dailyRes, catRes, topRes] = await Promise.allSettled([
        query<{ revenue: number; orders: number }>(`
          SELECT
            COALESCE(SUM(total), 0)::float AS revenue,
            COUNT(*)::int AS orders
          FROM orders
          WHERE payment_status = 'paid'
            AND status IS DISTINCT FROM 'cancelled'
            AND created_at >= $1::timestamptz
        `, [isoStart]),
        query<{ day: string; sales: number; orders: number }>(`
          SELECT
            (created_at AT TIME ZONE 'UTC')::date::text AS day,
            COALESCE(SUM(total), 0)::float AS sales,
            COUNT(*)::int AS orders
          FROM orders
          WHERE payment_status = 'paid'
            AND status IS DISTINCT FROM 'cancelled'
            AND created_at >= $1::timestamptz
          GROUP BY 1
          ORDER BY 1 ASC
        `, [isoStart]),
        query<{ name: string; value: number }>(`
          SELECT
            COALESCE(c.name, 'Uncategorized') AS name,
            COALESCE(SUM(oi.total_price), 0)::float AS value
          FROM order_items oi
          INNER JOIN orders o ON o.id = oi.order_id
          LEFT JOIN products p ON p.id = oi.product_id
          LEFT JOIN categories c ON c.id = p.category_id
          WHERE o.payment_status = 'paid'
            AND o.status IS DISTINCT FROM 'cancelled'
            AND o.created_at >= $1::timestamptz
          GROUP BY 1
          ORDER BY value DESC
          LIMIT 12
        `, [isoStart]),
        query<{ name: string; revenue: number; units: number }>(`
          SELECT
            COALESCE(p.name, oi.product_name, 'Unknown') AS name,
            COALESCE(SUM(oi.total_price), 0)::float AS revenue,
            COALESCE(SUM(oi.quantity), 0)::int AS units
          FROM order_items oi
          INNER JOIN orders o ON o.id = oi.order_id
          LEFT JOIN products p ON p.id = oi.product_id
          WHERE o.payment_status = 'paid'
            AND o.status IS DISTINCT FROM 'cancelled'
            AND o.created_at >= $1::timestamptz
          GROUP BY 1
          ORDER BY revenue DESC
          LIMIT 5
        `, [isoStart]),
      ]);

      const metricsRow = metricsRes.status === 'fulfilled' ? metricsRes.value.rows[0] : null;
      const revenue = Number(metricsRow?.revenue) || 0;
      const orders = Number(metricsRow?.orders) || 0;

      // Zero-fill daily chart
      const salesMap: Record<string, { date: string; sales: number; orders: number; fullDate: number }> = {};
      const d = new Date(start);
      const today = new Date();
      while (d <= today) {
        const key = d.toISOString().split('T')[0];
        salesMap[key] = {
          date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          sales: 0,
          orders: 0,
          fullDate: d.getTime(),
        };
        d.setDate(d.getDate() + 1);
      }
      if (dailyRes.status === 'fulfilled') {
        for (const row of dailyRes.value.rows) {
          if (salesMap[row.day]) {
            salesMap[row.day].sales = Number(row.sales) || 0;
            salesMap[row.day].orders = Number(row.orders) || 0;
          }
        }
      }

      return NextResponse.json({
        success: true,
        durationMs: Date.now() - started,
        range: timeRange,
        metrics: {
          revenue,
          orders,
          aov: orders > 0 ? revenue / orders : 0,
          conversion: 0,
          revenueGrowth: 0,
          ordersGrowth: 0,
          aovGrowth: 0,
          conversionGrowth: 0,
        },
        salesData: Object.values(salesMap),
        categoryRevenue:
          catRes.status === 'fulfilled'
            ? catRes.value.rows.map((r) => ({ name: r.name, value: Number(r.value) || 0 }))
            : [],
        topProducts:
          topRes.status === 'fulfilled'
            ? topRes.value.rows.map((r) => ({
                name: r.name,
                revenue: Number(r.revenue) || 0,
                units: Number(r.units) || 0,
              }))
            : [],
      });
    }

    // Legacy / non-plain path — still date-scoped and capped
    const { data: orders, error: orderError } = await supabaseAdmin
      .from('orders')
      .select('id, created_at, total')
      .gte('created_at', isoStart)
      .eq('payment_status', 'paid')
      .neq('status', 'cancelled')
      .order('created_at')
      .limit(5000);

    if (orderError) throw orderError;

    const orderIds = (orders || []).map((o: any) => o.id);
    let validItems: any[] = [];
    // Chunk .in() to avoid huge payloads
    for (let i = 0; i < orderIds.length; i += 200) {
      const chunk = orderIds.slice(i, i + 200);
      const { data: fetchedItems } = await supabaseAdmin
        .from('order_items')
        .select(`
          quantity, unit_price, total_price, product_id,
          products!inner(name, categories(name))
        `)
        .in('order_id', chunk);
      if (fetchedItems) validItems = validItems.concat(fetchedItems);
    }

    const revenue = (orders || []).reduce((s: number, o: any) => s + (Number(o.total) || 0), 0);
    const orderCount = (orders || []).length;

    const salesMap: Record<string, any> = {};
    const d = new Date(start);
    const today = new Date();
    while (d <= today) {
      const dateKey = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      salesMap[dateKey] = { date: dateKey, sales: 0, orders: 0, fullDate: d.getTime() };
      d.setDate(d.getDate() + 1);
    }
    (orders || []).forEach((o: any) => {
      const dateKey = new Date(o.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      if (salesMap[dateKey]) {
        salesMap[dateKey].sales += Number(o.total) || 0;
        salesMap[dateKey].orders += 1;
      }
    });

    const catMap: Record<string, any> = {};
    const prodMap: Record<string, any> = {};
    for (const item of validItems) {
      const catName = (item.products as any)?.categories?.name || 'Uncategorized';
      const pName = (item.products as any)?.name || 'Unknown';
      const itemRevenue = Number(item.total_price) || Number(item.unit_price) * Number(item.quantity) || 0;
      if (!catMap[catName]) catMap[catName] = { name: catName, value: 0 };
      catMap[catName].value += itemRevenue;
      if (!prodMap[pName]) prodMap[pName] = { name: pName, revenue: 0, units: 0 };
      prodMap[pName].revenue += itemRevenue;
      prodMap[pName].units += Number(item.quantity) || 0;
    }

    return NextResponse.json({
      success: true,
      durationMs: Date.now() - started,
      range: timeRange,
      metrics: {
        revenue,
        orders: orderCount,
        aov: orderCount > 0 ? revenue / orderCount : 0,
        conversion: 0,
        revenueGrowth: 0,
        ordersGrowth: 0,
        aovGrowth: 0,
        conversionGrowth: 0,
      },
      salesData: Object.values(salesMap),
      categoryRevenue: Object.values(catMap),
      topProducts: Object.values(prodMap)
        .sort((a: any, b: any) => b.revenue - a.revenue)
        .slice(0, 5),
    });
  } catch (e: any) {
    console.error('[admin/analytics]', e?.message || e);
    return NextResponse.json(
      { success: false, error: { code: 'ANALYTICS_FAILED', message: e?.message || 'Failed' } },
      { status: 500 }
    );
  }
}
