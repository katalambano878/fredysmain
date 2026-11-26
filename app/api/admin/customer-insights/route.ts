import { NextResponse } from 'next/server';
import { denyUnlessPermission } from '@/lib/admin-route-auth';
import { loadCustomerDirectory } from '../customers/directory';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const DAY = 1000 * 3600 * 24;

/**
 * Customer segments, built from the same directory as the Customers screen: the customers
 * table plus every order, matched by account, email or phone. Staff logins are not included.
 * GET /api/admin/customer-insights?limit=200&search=&segment=
 */
export async function GET(request: Request) {
  const err = await denyUnlessPermission(request, ['customer_insights']);
  if (err) return err;

  const { searchParams } = new URL(request.url);
  const limit = Math.min(500, Math.max(1, Number(searchParams.get('limit') || 200) || 200));
  const search = (searchParams.get('search') || '').trim().toLowerCase();
  const segmentFilter = searchParams.get('segment') || 'all';
  const started = Date.now();

  try {
    const directory = await loadCustomerDirectory();
    const now = Date.now();

    const all = directory.map((c) => {
      const lastOrderAt = c.lastOrderAt;
      const daysSinceLastOrder = lastOrderAt ? Math.floor((now - new Date(lastOrderAt).getTime()) / DAY) : null;

      // One segment each, most specific first.
      let segment = 'new';
      if (c.totalSpent > 1000) segment = 'vip';
      else if (c.orders > 0 && daysSinceLastOrder != null && daysSinceLastOrder > 90) segment = 'at-risk';
      else if (c.orders > 1) segment = 'returning';

      let riskLevel: 'low' | 'medium' | 'high' | null = null;
      if (daysSinceLastOrder != null) {
        riskLevel = daysSinceLastOrder > 120 ? 'high' : daysSinceLastOrder > 60 ? 'medium' : 'low';
      }

      return {
        id: c.id,
        name: c.name || 'No name given',
        email: c.email || '',
        phone: c.phone || '',
        segment,
        totalSpent: c.totalSpent,
        orders: c.orders,
        avgOrderValue: c.orders > 0 ? Math.round((c.totalSpent / c.orders) * 100) / 100 : 0,
        lifetimeValue: c.totalSpent,
        joinDate: c.joinedAt,
        lastOrder: lastOrderAt,
        daysSinceLastOrder,
        riskLevel,
        isGuest: c.isGuest,
      };
    });

    // Counts are for the whole shop, so the tabs do not change as you search.
    const totalCLV = all.reduce((s, c) => s + c.lifetimeValue, 0);
    const stats = {
      total: all.length,
      vip: all.filter((c) => c.segment === 'vip').length,
      returning: all.filter((c) => c.segment === 'returning').length,
      new: all.filter((c) => c.segment === 'new').length,
      atRisk: all.filter((c) => c.segment === 'at-risk').length,
      avgCLV: all.length > 0 ? totalCLV / all.length : 0,
    };

    const phoneSearch = search.replace(/\s+/g, '');
    const matching = all
      .filter((c) => segmentFilter === 'all' || c.segment === segmentFilter)
      .filter(
        (c) =>
          !search ||
          c.name.toLowerCase().includes(search) ||
          c.email.toLowerCase().includes(search) ||
          (phoneSearch && c.phone.replace(/\s+/g, '').includes(phoneSearch))
      )
      .sort((a, b) => b.totalSpent - a.totalSpent || String(b.lastOrder || '').localeCompare(String(a.lastOrder || '')));

    return NextResponse.json({
      success: true,
      durationMs: Date.now() - started,
      limit,
      matching: matching.length,
      customers: matching.slice(0, limit),
      stats,
    });
  } catch (e: any) {
    console.error('[admin/customer-insights]', e?.message || e);
    return NextResponse.json(
      { success: false, error: { code: 'INSIGHTS_FAILED', message: 'Customer insights could not load.' } },
      { status: 500 }
    );
  }
}
