import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdminSession } from '@/lib/admin-route-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const err = await requireAdminSession(request);
  if (err) return err;

  const { data, error } = await supabaseAdmin
    .from('homepage_gallery')
    .select('*')
    .order('sort_order', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}

export async function POST(request: Request) {
  const err = await requireAdminSession(request);
  if (err) return err;

  try {
    const body = await request.json();
    const image_url = String(body.image_url || '').trim();
    if (!image_url) {
      return NextResponse.json({ error: 'image_url is required' }, { status: 400 });
    }

    const title = String(body.title ?? '').trim();
    const caption = body.caption != null ? String(body.caption).trim() : null;
    const is_active = body.is_active !== false;
    let sort_order = Number(body.sort_order);
    if (!Number.isFinite(sort_order)) {
      const { data: maxRow } = await supabaseAdmin
        .from('homepage_gallery')
        .select('sort_order')
        .order('sort_order', { ascending: false })
        .limit(1)
        .maybeSingle();
      sort_order = (maxRow?.sort_order ?? -1) + 1;
    }

    const { data, error } = await supabaseAdmin
      .from('homepage_gallery')
      .insert({
        title,
        caption: caption || null,
        image_url,
        sort_order,
        is_active,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ item: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to create' }, { status: 500 });
  }
}
