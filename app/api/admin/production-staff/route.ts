import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdminSession, requirePermission } from '@/lib/admin-route-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const actor = await requirePermission(request, 'delete_staff');
  if (actor instanceof NextResponse) return actor;
  const { searchParams } = new URL(request.url);
  const activeOnly = searchParams.get('active') !== '0';
  let q = supabaseAdmin.from('production_staff').select('*').order('full_name');
  if (activeOnly) q = q.eq('is_active', true);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  const err = await requireAdminSession(request);
  if (err) return err;
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
