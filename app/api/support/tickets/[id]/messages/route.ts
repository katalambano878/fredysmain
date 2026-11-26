import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getAdminUserIdFromRequest, requireAdminSession } from '@/lib/admin-route-auth';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authErr = await requireAdminSession(req);
  if (authErr) return authErr;

  const { id } = await params;
  const { data, error } = await supabaseAdmin
    .from('support_ticket_messages')
    .select('*')
    .eq('ticket_id', id)
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authErr = await requireAdminSession(req);
  if (authErr) return authErr;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const content = String(body?.content || '').trim();
  if (!content) return NextResponse.json({ error: 'Write a note first' }, { status: 400 });

  // Recorded under the signed-in person, not a name sent by the browser.
  let senderName = 'Staff';
  const senderId = await getAdminUserIdFromRequest(req).catch(() => null);
  if (senderId) {
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('full_name, email')
      .eq('id', senderId)
      .maybeSingle();
    senderName = profile?.full_name || profile?.email || senderName;
  }

  const message = {
    ticket_id: id,
    sender_type: 'agent',
    sender_id: senderId,
    sender_name: senderName,
    content,
    is_internal: body.is_internal === true,
    attachments: Array.isArray(body.attachments) ? body.attachments : [],
  };

  const { data, error } = await supabaseAdmin
    .from('support_ticket_messages')
    .insert(message)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (!body.is_internal) {
    await supabaseAdmin
      .from('support_tickets')
      .update({
        first_response_at: new Date().toISOString(),
        status: 'in_progress',
      })
      .eq('id', id)
      .is('first_response_at', null);
  }

  return NextResponse.json({ data }, { status: 201 });
}
