import { NextRequest, NextResponse } from 'next/server';
import { requireAdminSession } from '@/lib/admin-route-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { loadCustomerDirectory } from '../directory';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/admin/customers/[id]: one customer and all their orders.
 * The id is a customer record id, a guest id from the list, or (older links) an account id.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authErr = await requireAdminSession(request);
  if (authErr) return authErr;

  const { id } = await params;
  try {
    const directory = await loadCustomerDirectory();
    let customer = directory.find((c) => c.id === id) || null;

    if (!customer && /^[0-9a-f-]{36}$/i.test(id)) {
      // Older links used the account id rather than the customer record id.
      const { data: record } = await supabaseAdmin.from('customers').select('id').eq('user_id', id).maybeSingle();
      if (record?.id) customer = directory.find((c) => c.id === String(record.id)) || null;
    }
    if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 });

    const orders = [...customer.orderList].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    const { orderList: _orders, ...details } = customer;
    return NextResponse.json({ customer: details, orders });
  } catch (err) {
    console.error('[admin/customers/id] load failed:', err);
    return NextResponse.json({ error: 'The customer could not load.' }, { status: 500 });
  }
}
