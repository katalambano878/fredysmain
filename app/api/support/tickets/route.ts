import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { denyUnlessPermission, getAdminUserIdFromRequest } from '@/lib/admin-route-auth';

export async function GET(req: NextRequest) {
  const authErr = await denyUnlessPermission(req, ['support']);
  if (authErr) return authErr;

  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '20');
  const status = searchParams.get('status') || '';
  const priority = searchParams.get('priority') || '';
  const search = searchParams.get('search') || '';
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabaseAdmin
    .from('support_tickets')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (status) query = query.eq('status', status);
  if (priority) query = query.eq('priority', priority);
  // Commas, brackets and dots have a meaning inside an or() filter: drop them from the search text.
  const term = search.replace(/[,()*%\\]/g, ' ').replace(/\s+/g, ' ').trim();
  if (term) {
    query = query.or(`ticket_number.ilike.%${term}%,subject.ilike.%${term}%,customer_email.ilike.%${term}%,customer_name.ilike.%${term}%`);
  }

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data, total: count, page, limit });
}

const TICKET_STATUSES = new Set(['open', 'in_progress', 'waiting', 'waiting_customer', 'resolved', 'closed']);
const TICKET_PRIORITIES = new Set(['low', 'medium', 'high', 'urgent']);

/** Next number after the highest existing one, e.g. TKT-00012 after TKT-00011. */
async function nextTicketNumber(): Promise<string> {
  let highest = 0;
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await supabaseAdmin
      .from('support_tickets')
      .select('ticket_number')
      .order('created_at', { ascending: false })
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    for (const row of data || []) {
      const match = /^TKT-(\d+)$/.exec(String(row.ticket_number || ''));
      // Old fallback numbers were a timestamp (13 digits): they are not part of the sequence.
      if (match && match[1].length <= 9) highest = Math.max(highest, parseInt(match[1], 10));
    }
    if (!data || data.length < 1000) break;
  }
  return `TKT-${String(highest + 1).padStart(5, '0')}`;
}

export async function POST(req: NextRequest) {
  const authErr = await denyUnlessPermission(req, ['support']);
  if (authErr) return authErr;

  const body = await req.json().catch(() => null);
  const subject = String(body?.subject || '').trim();
  if (!subject) return NextResponse.json({ error: 'A subject is required' }, { status: 400 });

  // Who is creating it: the reply is recorded under the signed-in person, never a name sent by the browser.
  let senderName = 'Staff';
  let senderId: string | null = null;
  try {
    senderId = await getAdminUserIdFromRequest(req);
    if (senderId) {
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('full_name, email')
        .eq('id', senderId)
        .maybeSingle();
      senderName = profile?.full_name || profile?.email || senderName;
    }
  } catch {
    /* keep the default name */
  }

  const priority = TICKET_PRIORITIES.has(body.priority) ? body.priority : 'medium';
  const status = TICKET_STATUSES.has(body.status) ? body.status : 'open';
  const hours = priority === 'urgent' ? 4 : priority === 'high' ? 8 : 24;

  let data: any = null;
  let lastError = 'Could not create the ticket';
  // Two people creating a ticket at the same moment can pick the same number: try the next one.
  for (let attempt = 0; attempt < 4 && !data; attempt++) {
    const ticket = {
      ticket_number: await nextTicketNumber(),
      subject,
      description: String(body.description || ''),
      customer_id: body.customer_id || null,
      customer_email: String(body.customer_email || ''),
      customer_name: String(body.customer_name || ''),
      conversation_id: body.conversation_id || null,
      status,
      priority,
      category: body.category || null,
      channel: body.channel || 'manual',
      assigned_to: body.assigned_to || null,
      tags: Array.isArray(body.tags) ? body.tags : [],
      sla_deadline: new Date(Date.now() + hours * 3600000).toISOString(),
    };
    const result = await supabaseAdmin.from('support_tickets').insert(ticket).select().single();
    if (!result.error) {
      data = result.data;
      break;
    }
    lastError = result.error.message || lastError;
    if (!/duplicate|unique/i.test(lastError)) break;
  }

  if (!data) return NextResponse.json({ error: lastError }, { status: 500 });

  if (body.initial_message) {
    const { error: messageError } = await supabaseAdmin.from('support_ticket_messages').insert({
      ticket_id: data.id,
      sender_type: 'agent',
      sender_id: senderId,
      sender_name: senderName,
      content: String(body.initial_message),
    });
    if (messageError) {
      return NextResponse.json(
        { data, warning: 'The ticket was created, but its first message could not be saved.' },
        { status: 201 }
      );
    }
  }

  return NextResponse.json({ data }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const authErr = await denyUnlessPermission(req, ['support']);
  if (authErr) return authErr;

  const body = await req.json().catch(() => null);
  const id = body?.id;
  if (!id) return NextResponse.json({ error: 'Ticket ID required' }, { status: 400 });
  // Only the fields the ticket screen edits. An unknown key would fail the whole update.
  const updates: Record<string, any> = {};
  for (const key of ['status', 'priority', 'assigned_to', 'category', 'resolution', 'subject', 'description', 'tags', 'resolved_at', 'closed_at']) {
    if (body[key] !== undefined) updates[key] = body[key];
  }
  if (updates.status !== undefined && !TICKET_STATUSES.has(updates.status)) {
    return NextResponse.json({ error: 'Unknown status' }, { status: 400 });
  }
  if (updates.priority !== undefined && !TICKET_PRIORITIES.has(updates.priority)) {
    return NextResponse.json({ error: 'Unknown priority' }, { status: 400 });
  }
  if (Object.keys(updates).length === 0) return NextResponse.json({ error: 'Nothing to change' }, { status: 400 });

  if (updates.status === 'resolved' && !updates.resolved_at) {
    updates.resolved_at = new Date().toISOString();
  }
  if (updates.status === 'closed' && !updates.closed_at) {
    updates.closed_at = new Date().toISOString();
  }

  const { data, error } = await supabaseAdmin
    .from('support_tickets')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
