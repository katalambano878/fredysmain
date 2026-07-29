import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdminSession } from '@/lib/admin-route-auth';

export async function GET(req: NextRequest) {
  const authErr = await requireAdminSession(req);
  if (authErr) return authErr;

  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '20');
  const search = searchParams.get('search') || '';
  const sentiment = searchParams.get('sentiment') || '';
  const category = searchParams.get('category') || '';
  const resolved = searchParams.get('resolved') || '';
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabaseAdmin
    .from('chat_conversations')
    .select('*', { count: 'exact' })
    .order('updated_at', { ascending: false })
    .range(from, to);

  if (search) {
    query = query.or(`customer_email.ilike.%${search}%,customer_name.ilike.%${search}%,summary.ilike.%${search}%`);
  }
  if (sentiment) query = query.eq('sentiment', sentiment);
  if (category) query = query.eq('category', category);
  if (resolved === 'true') query = query.eq('is_resolved', true);
  if (resolved === 'false') query = query.eq('is_resolved', false);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data, total: count, page, limit });
}

export async function PATCH(req: NextRequest) {
  const authErr = await requireAdminSession(req);
  if (authErr) return authErr;

  const body = await req.json();
  const { id, ...updates } = body;
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('chat_conversations')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
