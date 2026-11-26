import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getAdminActor, requirePermission } from '@/lib/admin-route-auth';

export const dynamic = 'force-dynamic';

/** Editing a production team member is for administrators only. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getAdminActor(request);
  if (!actor) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (actor.role !== 'admin') {
    return NextResponse.json({ error: 'Only an administrator can edit production team members.' }, { status: 403 });
  }
  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  try {
    const body = await request.json();
    const updates: Record<string, unknown> = {};
    if (body.full_name != null) updates.full_name = String(body.full_name).trim();
    if (body.phone !== undefined) updates.phone = body.phone?.trim() || null;
    if (body.notes !== undefined) updates.notes = body.notes?.trim() || null;
    if (body.is_active !== undefined) updates.is_active = !!body.is_active;
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }
    const { data, error } = await supabaseAdmin
      .from('production_staff')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePermission(request, 'delete_staff');
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  const { error } = await supabaseAdmin.from('production_staff').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
