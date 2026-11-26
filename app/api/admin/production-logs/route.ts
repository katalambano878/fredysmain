import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { denyUnlessPermission, getAdminUserIdFromRequest } from '@/lib/admin-route-auth';

export const dynamic = 'force-dynamic';

function monthBounds(ym: string): { start: string; end: string } {
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m || m < 1 || m > 12) {
    const now = new Date();
    const sy = now.getUTCFullYear();
    const sm = now.getUTCMonth() + 1;
    // The month's real last day. A fixed "31" is not a date in a 30-day month and the list failed.
    const lastDay = new Date(Date.UTC(sy, sm, 0)).getUTCDate();
    return {
      start: `${sy}-${String(sm).padStart(2, '0')}-01`,
      end: `${sy}-${String(sm).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
    };
  }
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return {
    start: `${y}-${String(m).padStart(2, '0')}-01`,
    end: `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`,
  };
}

export async function GET(request: Request) {
  const err = await denyUnlessPermission(request, ['finance']);
  if (err) return err;
  const { searchParams } = new URL(request.url);
  const ym = searchParams.get('month') || '';
  const { start, end } = monthBounds(ym);
  const staffId = searchParams.get('staff_id');

  let q = supabaseAdmin
    .from('production_logs')
    .select(
      `
      *,
      production_staff ( id, full_name ),
      products ( id, name, slug )
    `
    )
    .gte('logged_for', start)
    .lte('logged_for', end)
    .order('created_at', { ascending: false });
  if (staffId) q = q.eq('production_staff_id', staffId);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data, range: { start, end } });
}

export async function POST(request: Request) {
  const err = await denyUnlessPermission(request, ['finance']);
  if (err) return err;
  try {
    const body = await request.json();
    const production_staff_id = body.production_staff_id;
    const product_id = body.product_id;
    const quantity = parseInt(String(body.quantity), 10);
    const unit_labour_cost = parseFloat(String(body.unit_labour_cost ?? '0'));
    if (!production_staff_id || !product_id) {
      return NextResponse.json({ error: 'production_staff_id and product_id are required' }, { status: 400 });
    }
    if (!Number.isFinite(quantity) || quantity < 1) {
      return NextResponse.json({ error: 'quantity must be a positive integer' }, { status: 400 });
    }
    if (!Number.isFinite(unit_labour_cost) || unit_labour_cost < 0) {
      return NextResponse.json({ error: 'unit_labour_cost must be a non-negative number' }, { status: 400 });
    }
    let logged_for = body.logged_for;
    if (logged_for && typeof logged_for === 'string') {
      logged_for = logged_for.slice(0, 10);
    } else {
      const now = new Date();
      const sy = now.getUTCFullYear();
      const sm = now.getUTCMonth() + 1;
      logged_for = `${sy}-${String(sm).padStart(2, '0')}-01`;
    }
    const created_by = await getAdminUserIdFromRequest(request);
    const { data, error } = await supabaseAdmin
      .from('production_logs')
      .insert({
        production_staff_id,
        product_id,
        quantity,
        unit_labour_cost,
        logged_for,
        notes: body.notes?.trim() || null,
        created_by,
      })
      .select(
        `
        *,
        production_staff ( id, full_name ),
        products ( id, name, slug )
      `
      )
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 });
  }
}
