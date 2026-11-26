import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdminSession } from '@/lib/admin-route-auth';

export async function GET(req: NextRequest) {
  // Staff only: this list includes unpublished drafts. (The chat assistant reads articles on the server.)
  const authErr = await requireAdminSession(req);
  if (authErr) return authErr;

  const { searchParams } = new URL(req.url);
  // Commas, brackets and dots have a meaning inside an or() filter: drop them from the search text.
  const search = (searchParams.get('search') || '').replace(/[,()*%\\.]/g, ' ').replace(/\s+/g, ' ').trim();
  const category = searchParams.get('category') || '';
  const published = searchParams.get('published');

  let query = supabaseAdmin
    .from('support_knowledge_base')
    .select('*')
    .order('updated_at', { ascending: false });

  if (search) query = query.or(`title.ilike.%${search}%,content.ilike.%${search}%`);
  if (category) query = query.eq('category', category);
  if (published === 'true') query = query.eq('is_published', true);
  if (published === 'false') query = query.eq('is_published', false);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const authErr = await requireAdminSession(req);
  if (authErr) return authErr;

  const body = await req.json();
  const { data, error } = await supabaseAdmin
    .from('support_knowledge_base')
    .insert({
      title: body.title,
      content: body.content,
      category: body.category || null,
      tags: body.tags || [],
      source: body.source || 'manual',
      source_ticket_id: body.source_ticket_id || null,
      is_published: body.is_published ?? true,
      created_by: body.created_by || 'admin',
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const authErr = await requireAdminSession(req);
  if (authErr) return authErr;

  const body = await req.json().catch(() => null);
  const id = body?.id;
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });
  const updates: Record<string, any> = { updated_at: new Date().toISOString() };
  for (const key of ['title', 'content', 'category', 'tags', 'is_published']) {
    if (body[key] !== undefined) updates[key] = body[key];
  }

  const { data, error } = await supabaseAdmin
    .from('support_knowledge_base')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function DELETE(req: NextRequest) {
  const authErr = await requireAdminSession(req);
  if (authErr) return authErr;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

  const { error } = await supabaseAdmin.from('support_knowledge_base').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
