import { NextResponse } from 'next/server';
import { requireAdminSession } from '@/lib/admin-route-auth';
import { isPlainPostgres } from '@/lib/db/mode';
import { query } from '@/lib/db/pool';
import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * Server-side customer segments — no full profiles+orders dump to browser.
 * GET /api/admin/customer-insights?limit=200&search=
 */
export async function GET(request: Request) {
  const err = await requireAdminSession(request);
  if (err) return err;

  const { searchParams } = new URL(request.url);
  const limit = Math.min(500, Math.max(1, Number(searchParams.get('limit') || 200) || 200));
  const search = (searchParams.get('search') || '').trim().toLowerCase();
  const segmentFilter = searchParams.get('segment') || 'all';
  const started = Date.now();

  try {
    if (isPlainPostgres()) {
      const { rows } = await query<any>(`
        WITH order_agg AS (
          SELECT
            user_id,
            COUNT(*)::int AS order_count,
            COALESCE(SUM(total), 0)::float AS total_spent,
            MAX(created_at) AS last_order_at
          FROM orders
          WHERE status IS DISTINCT FROM 'cancelled'
            AND user_id IS NOT NULL
          GROUP BY user_id
        )
        SELECT
          p.id,
          p.full_name,
          p.email,
          p.phone,
          p.created_at,
          COALESCE(oa.order_count, 0)::int AS order_count,
          COALESCE(oa.total_spent, 0)::float AS total_spent,
          oa.last_order_at
        FROM profiles p
        LEFT JOIN order_agg oa ON oa.user_id = p.id
        WHERE ($1 = '' OR LOWER(COALESCE(p.full_name, '')) LIKE '%' || $1 || '%'
                     OR LOWER(COALESCE(p.email, '')) LIKE '%' || $1 || '%')
        ORDER BY COALESCE(oa.total_spent, 0) DESC, p.created_at DESC
        LIMIT $2
      `, [search, limit]);

      const now = Date.now();
      const customers = rows.map((r) => {
        const totalSpent = Number(r.total_spent) || 0;
        const orderCount = Number(r.order_count) || 0;
        const lastOrderDate = r.last_order_at || r.created_at;
        const daysSinceJoin = (now - new Date(r.created_at).getTime()) / (1000 * 3600 * 24);
        const daysSinceLastOrder = (now - new Date(lastOrderDate).getTime()) / (1000 * 3600 * 24);

        let segment = 'returning';
        if (totalSpent > 1000) segment = 'vip';
        else if (orderCount > 1) segment = 'returning';
        else if (daysSinceLastOrder > 90 && orderCount > 0) segment = 'at-risk';
        else if (daysSinceJoin < 30) segment = 'new';

        let riskLevel = 'low';
        if (daysSinceLastOrder > 60) riskLevel = 'medium';
        if (daysSinceLastOrder > 120) riskLevel = 'high';

        let engagementScore = 50;
        if (segment === 'vip') engagementScore += 40;
        if (riskLevel === 'high') engagementScore -= 30;
        if (daysSinceLastOrder < 30) engagementScore += 20;

        return {
          id: r.id,
          name: r.full_name || 'Unknown User',
          email: r.email,
          phone: r.phone || '-',
          segment,
          totalSpent,
          orders: orderCount,
          avgOrderValue: orderCount > 0 ? totalSpent / orderCount : 0,
          lifetimeValue: totalSpent,
          joinDate: r.created_at,
          lastOrder: lastOrderDate,
          riskLevel,
          engagementScore: Math.min(100, Math.max(0, engagementScore)),
          tags: [] as string[],
        };
      });

      const filtered =
        segmentFilter === 'all'
          ? customers
          : customers.filter((c) => c.segment === segmentFilter);

      // Stats over the fetched window (not whole DB — honest about sample)
      const forStats = customers;
      const totalCLV = forStats.reduce((s, c) => s + c.lifetimeValue, 0);

      return NextResponse.json({
        success: true,
        durationMs: Date.now() - started,
        limit,
        customers: filtered,
        stats: {
          vip: forStats.filter((c) => c.segment === 'vip').length,
          returning: forStats.filter((c) => c.segment === 'returning').length,
          new: forStats.filter((c) => c.segment === 'new').length,
          atRisk: forStats.filter((c) => c.segment === 'at-risk').length,
          avgCLV: forStats.length > 0 ? totalCLV / forStats.length : 0,
        },
      });
    }

    // Fallback path
    const { data: profiles } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, email, phone, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);

    const { data: orders } = await supabaseAdmin
      .from('orders')
      .select('user_id, total, created_at, status')
      .neq('status', 'cancelled')
      .not('user_id', 'is', null)
      .limit(3000);

    const now = Date.now();
    const customers = (profiles || []).map((profile: any) => {
      const userOrders = (orders || []).filter((o: any) => o.user_id === profile.id);
      const totalSpent = userOrders.reduce((sum: number, o: any) => sum + (Number(o.total) || 0), 0);
      const orderCount = userOrders.length;
      const sorted = [...userOrders].sort(
        (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      const lastOrderDate = sorted[0]?.created_at || profile.created_at;
      const daysSinceJoin = (now - new Date(profile.created_at).getTime()) / (1000 * 3600 * 24);
      const daysSinceLastOrder = (now - new Date(lastOrderDate).getTime()) / (1000 * 3600 * 24);

      let segment = 'returning';
      if (totalSpent > 1000) segment = 'vip';
      else if (orderCount > 1) segment = 'returning';
      else if (daysSinceLastOrder > 90 && orderCount > 0) segment = 'at-risk';
      else if (daysSinceJoin < 30) segment = 'new';

      let riskLevel = 'low';
      if (daysSinceLastOrder > 60) riskLevel = 'medium';
      if (daysSinceLastOrder > 120) riskLevel = 'high';

      return {
        id: profile.id,
        name: profile.full_name || 'Unknown User',
        email: profile.email,
        phone: profile.phone || '-',
        segment,
        totalSpent,
        orders: orderCount,
        avgOrderValue: orderCount > 0 ? totalSpent / orderCount : 0,
        lifetimeValue: totalSpent,
        joinDate: profile.created_at,
        lastOrder: lastOrderDate,
        riskLevel,
        engagementScore: 50,
        tags: [],
      };
    });

    const filtered =
      segmentFilter === 'all'
        ? customers
        : customers.filter((c) => c.segment === segmentFilter);
    const totalCLV = customers.reduce((s, c) => s + c.lifetimeValue, 0);

    return NextResponse.json({
      success: true,
      durationMs: Date.now() - started,
      limit,
      customers: filtered,
      stats: {
        vip: customers.filter((c) => c.segment === 'vip').length,
        returning: customers.filter((c) => c.segment === 'returning').length,
        new: customers.filter((c) => c.segment === 'new').length,
        atRisk: customers.filter((c) => c.segment === 'at-risk').length,
        avgCLV: customers.length > 0 ? totalCLV / customers.length : 0,
      },
    });
  } catch (e: any) {
    console.error('[admin/customer-insights]', e?.message || e);
    return NextResponse.json(
      { success: false, error: { code: 'INSIGHTS_FAILED', message: e?.message || 'Failed' } },
      { status: 500 }
    );
  }
}
