import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getAdminActor } from '@/lib/admin-route-auth';

export const dynamic = 'force-dynamic';

/**
 * The list is needed by three screens: the product form (who made it), Finance (log production)
 * and the production team page. Staff who can open any of those may read it.
 */
const READ_PERMISSIONS = ['products', 'finance', 'delete_staff'];

export async function GET(request: Request) {
  const actor = await getAdminActor(request);
  if (!actor) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (actor.role !== 'admin' && !READ_PERMISSIONS.some((key) => actor.permissions[key] === true)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { searchParams } = new URL(request.url);
  const activeOnly = searchParams.get('active') !== '0';
  let q = supabaseAdmin.from('production_staff').select('*').order('full_name');
  if (activeOnly) q = q.eq('is_active', true);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

/** Adding a production team member is for administrators only. */
export async function POST(request: Request) {
  const actor = await getAdminActor(request);
  if (!actor) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (actor.role !== 'admin') {
    return NextResponse.json({ error: 'Only an administrator can add production team members.' }, { status: 403 });
  }
  try {
    const body = await request.json();
    const full_name = String(body.full_name || '').trim();
    if (!full_name) return NextResponse.json({ error: 'full_name is required' }, { status: 400 });
    const { data, error } = await supabaseAdmin
      .from('production_staff')
      .insert({
        full_name,
        phone: body.phone?.trim() || null,
        notes: body.notes?.trim() || null,
        is_active: body.is_active !== false,
      })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 });
  }
}
