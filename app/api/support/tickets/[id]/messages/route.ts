import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
  const { id } = await params;
  const body = await req.json();

  const message = {
    ticket_id: id,
    sender_type: body.sender_type || 'agent',
    sender_id: body.sender_id || null,
    sender_name: body.sender_name || 'Admin',
    content: body.content,
    is_internal: body.is_internal || false,
    attachments: body.attachments || [],
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
        status: body.sender_type === 'agent' ? 'waiting_customer' : 'in_progress',
      })
      .eq('id', id)
      .is('first_response_at', null);
  }

  return NextResponse.json({ data }, { status: 201 });
}
