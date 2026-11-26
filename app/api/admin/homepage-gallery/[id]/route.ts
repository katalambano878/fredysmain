import { NextResponse } from 'next/server';
import { denyUnlessPermission } from '@/lib/admin-route-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const err = await denyUnlessPermission(request, ['products']);
  if (err) return err;

  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  try {
    const body = await request.json();
    const patch: Record<string, unknown> = {};

    if (body.title !== undefined) patch.title = String(body.title ?? '').trim();
    if (body.caption !== undefined) {
      const c = String(body.caption ?? '').trim();
      patch.caption = c ? c : null;
    }
    if (body.image_url !== undefined) {
      const u = String(body.image_url || '').trim();
      if (!u) return NextResponse.json({ error: 'image_url cannot be empty' }, { status: 400 });
      patch.image_url = u;
    }
    if (body.sort_order !== undefined) {
      const n = Number(body.sort_order);
      if (!Number.isFinite(n)) return NextResponse.json({ error: 'Invalid sort_order' }, { status: 400 });
      patch.sort_order = n;
    }
    if (body.is_active !== undefined) patch.is_active = Boolean(body.is_active);

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('homepage_gallery')
      .update(patch)
      .eq('id', id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ item: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to update' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const err = await denyUnlessPermission(request, ['products']);
  if (err) return err;

  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const { error } = await supabaseAdmin.from('homepage_gallery').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
