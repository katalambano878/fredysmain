import { NextRequest, NextResponse } from 'next/server';
import { requireAdminSession } from '@/lib/admin-route-auth';
import { loadCustomerDirectory } from './directory';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** GET /api/admin/customers: every customer with their order count and what they have paid. */
export async function GET(request: NextRequest) {
  const authErr = await requireAdminSession(request);
  if (authErr) return authErr;

  try {
    const directory = await loadCustomerDirectory();
    const customers = directory.map(({ orderList: _orders, ...customer }) => customer);
    return NextResponse.json({ customers });
  } catch (err) {
    console.error('[admin/customers] load failed:', err);
    return NextResponse.json({ error: 'The customers could not load.' }, { status: 500 });
  }
}
