'use client';

import { useState, useEffect, useCallback, useRef, use } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import MarkdownMessage from '@/components/MarkdownMessage';

const STATUS_OPTIONS = ['open', 'in_progress', 'waiting_customer', 'resolved', 'closed'];
const PRIORITY_OPTIONS = ['low', 'medium', 'high', 'urgent'];

export default function TicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [ticket, setTicket] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [sending, setSending] = useState(false);
  const [conversation, setConversation] = useState<any>(null);
  const [notice, setNotice] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchTicket = useCallback(async () => {
    setLoading(true);
    const [ticketRes, msgsRes] = await Promise.all([
      supabase.from('support_tickets').select('*').eq('id', id).single(),
      fetch(`/api/support/tickets/${id}/messages`)
        .then(async (r) => ({ ok: r.ok, json: await r.json().catch(() => ({})) }))
        .catch(() => ({ ok: false, json: {} as any })),
    ]);
    setTicket(ticketRes.data);
    setAssignedTo(ticketRes.data?.assigned_to || '');
    setMessages(msgsRes.json?.data || []);
    if (!msgsRes.ok) setNotice(msgsRes.json?.error || 'The notes on this ticket could not load. Refresh to try again.');

    if (ticketRes.data?.conversation_id) {
      const { data: conv } = await supabase.from('chat_conversations').select('id, session_id, messages, summary, sentiment, customer_name').eq('id', ticketRes.data.conversation_id).single();
      setConversation(conv);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => { fetchTicket(); }, [fetchTicket]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!reply.trim()) return;
    setSending(true);
    setNotice('');
    try {
      const res = await fetch(`/api/support/tickets/${id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: reply, is_internal: isInternal }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        // Keep what was typed so it can be sent again.
        setNotice(json?.error || 'The note was not saved. Try again.');
        return;
      }
      setReply('');
      setIsInternal(false);
      await fetchTicket();
    } catch {
      setNotice('The note was not saved. Check your connection and try again.');
    } finally {
      setSending(false);
    }
  }

  async function updateTicket(updates: any) {
    setNotice('');
    try {
      const res = await fetch('/api/support/tickets', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...updates }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setNotice(json?.error || 'That change was not saved. Try again.');
        return false;
      }
      setTicket((prev: any) => ({ ...prev, ...updates }));
      return true;
    } catch {
      setNotice('That change was not saved. Check your connection and try again.');
      return false;
    }
  }

  async function addResolution() {
    const resolution = prompt('Enter resolution summary:');
    if (resolution) {
      await updateTicket({ resolution, status: 'resolved', resolved_at: new Date().toISOString() });
    }
  }

  if (loading) return <div className="flex items-center justify-center h-64"><i className="ri-loader-4-line animate-spin text-3xl text-gray-400" /></div>;
  if (!ticket) return <div className="text-center p-12"><p className="text-gray-500">Ticket not found</p></div>;

  const priorityColors: Record<string, string> = { urgent: 'bg-red-100 text-red-700', high: 'bg-orange-100 text-orange-700', medium: 'bg-blue-100 text-blue-700', low: 'bg-gray-100 text-gray-600' };
  const statusColors: Record<string, string> = { open: 'bg-blue-100 text-blue-700', in_progress: 'bg-yellow-100 text-yellow-700', waiting_customer: 'bg-purple-100 text-purple-700', resolved: 'bg-gray-100 text-gray-900', closed: 'bg-gray-200 text-gray-600' };
  const senderColors: Record<string, string> = { customer: 'bg-blue-600', agent: 'bg-gray-700', system: 'bg-gray-500', ai: 'bg-purple-600' };

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/admin/support" className="hover:text-gray-700">Support</Link>
        <i className="ri-arrow-right-s-line text-xs" />
        <Link href="/admin/support/tickets" className="hover:text-gray-700">Tickets</Link>
        <i className="ri-arrow-right-s-line text-xs" />
        <span className="text-gray-900 font-medium">{ticket.ticket_number}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Message Thread - 2/3 */}
        <div className="lg:col-span-2 space-y-4">
          {/* Ticket Header */}
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-mono text-gray-700 font-semibold">{ticket.ticket_number}</span>
                  <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-full ${priorityColors[ticket.priority]}`}>{ticket.priority}</span>
                  <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-full ${statusColors[ticket.status]}`}>{ticket.status.replace(/_/g, ' ')}</span>
                </div>
                <h1 className="text-lg font-bold text-gray-900">{ticket.subject}</h1>
                {ticket.description && <p className="text-sm text-gray-500 mt-1">{ticket.description}</p>}
              </div>
              <div className="flex gap-2">
                <button onClick={addResolution}
                  className="px-3 py-1.5 text-xs font-medium bg-gray-700 text-white rounded-lg hover:bg-gray-900 transition-colors">
                  <i className="ri-check-double-line mr-1" /> Resolve
                </button>
              </div>
            </div>
            {ticket.resolution && (
              <div className="mt-3 p-3 bg-gray-50 border border-gray-100 rounded-lg">
                <p className="text-xs font-semibold text-gray-900 mb-1">Resolution</p>
                <p className="text-sm text-gray-800">{ticket.resolution}</p>
              </div>
            )}
          </div>

          {/* Linked Conversation */}
          {conversation && (
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                  <i className="ri-chat-3-line text-blue-500" /> Linked AI Conversation
                </h3>
                <Link href={`/admin/support/conversations/${conversation.id}`} className="text-xs text-gray-700 hover:text-gray-900 font-medium">View full →</Link>
              </div>
              <div className="max-h-40 overflow-y-auto space-y-2 bg-gray-50 rounded-lg p-3">
                {(Array.isArray(conversation.messages) ? conversation.messages : typeof conversation.messages === 'string' ? (() => { try { return JSON.parse(conversation.messages); } catch { return []; } })() : []).slice(-6).map((m: any, i: number) => (
                  <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-lg px-3 py-1.5 text-xs ${m.role === 'user' ? 'bg-gray-100 text-gray-800' : 'bg-white text-gray-700 border border-gray-100'}`}>
                      {m.content?.slice(0, 150)}{m.content?.length > 150 ? '...' : ''}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Message Thread */}
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="bg-gray-50 px-4 py-3 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-700">Ticket Thread ({messages.length} messages)</h3>
            </div>
            <div className="max-h-[500px] overflow-y-auto p-4 space-y-4">
              {messages.length === 0 && (
                <div className="text-center text-gray-400 py-8">
                  <i className="ri-chat-new-line text-3xl mb-2 block" />
                  <p className="text-sm">No messages yet. Start the conversation below.</p>
                </div>
              )}
              {messages.map((msg: any) => (
                <div key={msg.id} className={`flex gap-3 ${msg.is_internal ? 'bg-amber-50/50 -mx-4 px-4 py-2 border-l-2 border-amber-300' : ''}`}>
                  <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-white text-xs font-bold ${senderColors[msg.sender_type] || 'bg-gray-400'}`}>
                    {msg.sender_type === 'customer' ? 'C' : msg.sender_type === 'agent' ? 'A' : msg.sender_type === 'ai' ? 'AI' : 'S'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900">{msg.sender_name || msg.sender_type}</span>
                      <span className="text-[10px] text-gray-400">{new Date(msg.created_at).toLocaleString()}</span>
                      {msg.is_internal && <span className="text-[9px] font-bold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded">INTERNAL NOTE</span>}
                    </div>
                    <div className="mt-1"><MarkdownMessage content={msg.content || ''} /></div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Reply Form */}
            <form onSubmit={sendMessage} className="border-t border-gray-100 p-4 space-y-3">
              <p className="text-xs text-gray-600">
                Internal note: the customer is not messaged from here. Call, text or email them yourself, then record what was said.
              </p>
              {notice && (
                <p role="alert" className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{notice}</p>
              )}
              <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={3} aria-label="Note" placeholder="Write a note for the team..."

                className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 resize-none ${isInternal ? 'border-amber-200 bg-amber-50 focus:ring-amber-400' : 'border-gray-200 focus:ring-gray-600'}`} />
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                  <input type="checkbox" checked={isInternal} onChange={(e) => setIsInternal(e.target.checked)}
                    className="rounded border-gray-300 text-amber-600 focus:ring-amber-500" />
                  Private (hide from the shared ticket history)
                </label>
                <button type="submit" disabled={sending || !reply.trim()}
                  className="px-4 py-2 text-xs font-medium bg-gray-700 text-white rounded-lg hover:bg-gray-900 disabled:opacity-40 transition-colors">
                  {sending ? 'Saving...' : 'Add note'}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Sidebar - 1/3 */}
        <div className="space-y-4">
          {/* Status & Priority Controls */}
          <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-900">Ticket Controls</h3>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
              <select value={ticket.status} onChange={(e) => updateTicket({ status: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-600">
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Priority</label>
              <select value={ticket.priority} onChange={(e) => updateTicket({ priority: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-600">
                {PRIORITY_OPTIONS.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Assigned To</label>
              <input
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                onBlur={() => {
                  if (assignedTo.trim() !== (ticket.assigned_to || '')) updateTicket({ assigned_to: assignedTo.trim() || null });
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                }}
                placeholder="Agent name or email"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-600" />
            </div>
          </div>

          {/* Customer Info */}
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <i className="ri-user-3-line text-gray-400" /> Customer
            </h3>
            <div className="space-y-2 text-sm">
              {ticket.customer_name && <div className="flex justify-between"><span className="text-gray-500">Name</span><span className="font-medium">{ticket.customer_name}</span></div>}
              {ticket.customer_email && <div className="flex justify-between"><span className="text-gray-500">Email</span><span className="font-medium text-xs">{ticket.customer_email}</span></div>}
              <div className="flex justify-between"><span className="text-gray-500">Channel</span><span className="font-medium capitalize">{ticket.channel}</span></div>
            </div>
          </div>

          {/* Ticket Timeline */}
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <i className="ri-time-line text-gray-400" /> Timeline
            </h3>
            <div className="space-y-3">
              <div className="flex items-start gap-2">
                <div className="w-2 h-2 mt-1.5 rounded-full bg-blue-500 shrink-0" />
                <div><p className="text-xs font-medium text-gray-700">Created</p><p className="text-[10px] text-gray-400">{new Date(ticket.created_at).toLocaleString()}</p></div>
              </div>
              {ticket.first_response_at && (
                <div className="flex items-start gap-2">
                  <div className="w-2 h-2 mt-1.5 rounded-full bg-yellow-500 shrink-0" />
                  <div><p className="text-xs font-medium text-gray-700">First Response</p><p className="text-[10px] text-gray-400">{new Date(ticket.first_response_at).toLocaleString()}</p></div>
                </div>
              )}
              {ticket.resolved_at && (
                <div className="flex items-start gap-2">
                  <div className="w-2 h-2 mt-1.5 rounded-full bg-gray-600 shrink-0" />
                  <div><p className="text-xs font-medium text-gray-700">Resolved</p><p className="text-[10px] text-gray-400">{new Date(ticket.resolved_at).toLocaleString()}</p></div>
                </div>
              )}
              {ticket.closed_at && (
                <div className="flex items-start gap-2">
                  <div className="w-2 h-2 mt-1.5 rounded-full bg-gray-400 shrink-0" />
                  <div><p className="text-xs font-medium text-gray-700">Closed</p><p className="text-[10px] text-gray-400">{new Date(ticket.closed_at).toLocaleString()}</p></div>
                </div>
              )}
              {ticket.sla_deadline && ticket.status !== 'resolved' && ticket.status !== 'closed' && (
                <div className="flex items-start gap-2">
                  <div className={`w-2 h-2 mt-1.5 rounded-full shrink-0 ${new Date(ticket.sla_deadline) < new Date() ? 'bg-red-500' : 'bg-orange-400'}`} />
                  <div>
                    <p className="text-xs font-medium text-gray-700">SLA Deadline</p>
                    <p className={`text-[10px] ${new Date(ticket.sla_deadline) < new Date() ? 'text-red-500 font-bold' : 'text-gray-400'}`}>{new Date(ticket.sla_deadline).toLocaleString()}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Tags */}
          {ticket.tags?.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-2">Tags</h3>
              <div className="flex flex-wrap gap-1">{ticket.tags.map((t: string) => <span key={t} className="px-2 py-0.5 text-[10px] bg-gray-100 text-gray-600 rounded-full">{t}</span>)}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
