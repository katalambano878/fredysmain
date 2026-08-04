'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const STATUS_TABS = ['all', 'open', 'in_progress', 'waiting_customer', 'resolved', 'closed'];
const PRIORITY_OPTIONS = ['all', 'urgent', 'high', 'medium', 'low'];

export default function TicketsPage() {
  const searchParams = useSearchParams();
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusTab, setStatusTab] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [showNewModal, setShowNewModal] = useState(searchParams.get('new') === '1');
  const limit = 20;

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    try {
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      let query = supabase
        .from('support_tickets')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to);

      if (statusTab !== 'all') query = query.eq('status', statusTab);
      if (priorityFilter !== 'all') query = query.eq('priority', priorityFilter);
      if (search) {
        query = query.or(
          `ticket_number.ilike.%${search}%,subject.ilike.%${search}%,customer_email.ilike.%${search}%,customer_name.ilike.%${search}%`
        );
      }

      const { data, count, error } = await query;
      if (error) throw error;
      setTickets(data || []);
      setTotal(count || 0);
    } catch (e) {
      console.error('[Tickets] load failed:', e);
      setTickets([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, statusTab, priorityFilter, search]);

  useEffect(() => { fetchTickets(); }, [fetchTickets]);

  const priorityBadge = (p: string) => {
    const c: Record<string, string> = { urgent: 'bg-red-100 text-red-700 ring-1 ring-red-200', high: 'bg-orange-100 text-orange-700', medium: 'bg-blue-100 text-blue-700', low: 'bg-gray-100 text-gray-600' };
    return <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-full ${c[p] || c.medium}`}>{p}</span>;
  };

  const statusBadge = (s: string) => {
    const c: Record<string, string> = { open: 'bg-blue-100 text-blue-700', in_progress: 'bg-yellow-100 text-yellow-700', waiting_customer: 'bg-purple-100 text-purple-700', waiting_agent: 'bg-orange-100 text-orange-700', resolved: 'bg-gray-100 text-gray-900', closed: 'bg-gray-100 text-gray-600' };
    return <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-full ${c[s] || c.open}`}>{s.replace(/_/g, ' ')}</span>;
  };

  const slaStatus = (ticket: any) => {
    if (!ticket.sla_deadline || ticket.status === 'resolved' || ticket.status === 'closed') return null;
    const deadline = new Date(ticket.sla_deadline).getTime();
    const now = Date.now();
    const hoursLeft = (deadline - now) / 3600000;
    if (hoursLeft < 0) return <span className="text-[9px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">SLA BREACHED</span>;
    if (hoursLeft < 2) return <span className="text-[9px] font-bold text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded">SLA &lt;2h</span>;
    return null;
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
            <Link href="/admin/support" className="hover:text-gray-700">Support</Link>
            <i className="ri-arrow-right-s-line text-xs" />
            <span className="text-gray-900 font-medium">Tickets</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Support Tickets</h1>
        </div>
        <button onClick={() => setShowNewModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-900 text-sm font-medium transition-colors">
          <i className="ri-add-line" /> New Ticket
        </button>
      </div>

      {/* Status Tabs */}
      <div className="flex gap-1 bg-white rounded-xl border border-gray-100 p-1 overflow-x-auto">
        {STATUS_TABS.map(tab => (
          <button key={tab} onClick={() => { setStatusTab(tab); setPage(1); }}
            className={`px-4 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${statusTab === tab ? 'bg-gray-700 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
            {tab === 'all' ? 'All' : tab.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
          </button>
        ))}
      </div>

      {/* Search & Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Search tickets..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-600" />
        </div>
        <select value={priorityFilter} onChange={(e) => { setPriorityFilter(e.target.value); setPage(1); }}
          className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-600">
          {PRIORITY_OPTIONS.map(p => <option key={p} value={p}>{p === 'all' ? 'All Priorities' : p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
        </select>
      </div>

      {/* Tickets List */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center"><i className="ri-loader-4-line animate-spin text-2xl text-gray-400" /></div>
        ) : tickets.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <i className="ri-ticket-line text-5xl mb-3 block" />
            <p className="text-sm font-medium">No tickets found</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            <div className="hidden lg:grid grid-cols-12 gap-4 px-4 py-3 bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide">
              <div className="col-span-1">Ticket</div>
              <div className="col-span-3">Subject</div>
              <div className="col-span-2">Customer</div>
              <div className="col-span-1">Priority</div>
              <div className="col-span-2">Status</div>
              <div className="col-span-1">Assigned</div>
              <div className="col-span-2 text-right">Created</div>
            </div>
            {tickets.map((t) => (
              <Link key={t.id} href={`/admin/support/tickets/${t.id}`}
                className="grid grid-cols-1 lg:grid-cols-12 gap-2 lg:gap-4 px-4 py-3 hover:bg-gray-50 transition-colors items-center">
                <div className="col-span-1">
                  <span className="text-xs font-mono text-gray-700 font-semibold">{t.ticket_number}</span>
                </div>
                <div className="col-span-3">
                  <p className="text-sm font-medium text-gray-900 truncate">{t.subject}</p>
                  {t.category && <span className="text-[10px] text-gray-400">{t.category}</span>}
                </div>
                <div className="col-span-2">
                  <p className="text-sm text-gray-700 truncate">{t.customer_name || t.customer_email || '—'}</p>
                </div>
                <div className="col-span-1">{priorityBadge(t.priority)}</div>
                <div className="col-span-2 flex items-center gap-1.5 flex-wrap">
                  {statusBadge(t.status)}
                  {slaStatus(t)}
                </div>
                <div className="col-span-1">
                  <span className="text-xs text-gray-500">{t.assigned_to || '—'}</span>
                </div>
                <div className="col-span-2 text-right">
                  <p className="text-xs text-gray-500">{new Date(t.created_at).toLocaleDateString()}</p>
                  <p className="text-[10px] text-gray-400">{new Date(t.created_at).toLocaleTimeString()}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <p className="text-xs text-gray-500">Page {page} of {totalPages}</p>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40">Prev</button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40">Next</button>
            </div>
          </div>
        )}
      </div>

      {/* New Ticket Modal */}
      {showNewModal && <NewTicketModal onClose={() => setShowNewModal(false)} onCreated={fetchTickets} />}
    </div>
  );
}

function NewTicketModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ subject: '', description: '', customer_email: '', customer_name: '', priority: 'medium', category: '' });
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.subject) return;
    setSaving(true);
    await fetch('/api/support/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, channel: 'manual' }),
    });
    setSaving(false);
    onCreated();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">New Support Ticket</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100"><i className="ri-close-line text-lg" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Subject *</label>
            <input required value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-600" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
            <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-600" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Customer Name</label>
              <input value={form.customer_name} onChange={e => setForm({ ...form, customer_name: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-600" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Customer Email</label>
              <input type="email" value={form.customer_email} onChange={e => setForm({ ...form, customer_email: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-600" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Priority</label>
              <select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-600">
                <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Category</label>
              <input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} placeholder="e.g., order, product"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-600" />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 text-sm bg-gray-700 text-white rounded-lg hover:bg-gray-900 disabled:opacity-50">
              {saving ? 'Creating...' : 'Create Ticket'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
