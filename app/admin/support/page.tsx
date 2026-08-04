'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export default function SupportDashboard() {
  const [stats, setStats] = useState<any>(null);
  const [recentConversations, setRecentConversations] = useState<any[]>([]);
  const [openTickets, setOpenTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboard();
  }, []);

  async function fetchDashboard() {
    setLoading(true);
    try {
      const [statsRes, convosRes, ticketsRes] = await Promise.all([
        supabase.rpc('get_support_dashboard_stats'),
        supabase.from('chat_conversations').select('*').order('updated_at', { ascending: false }).limit(8),
        supabase
          .from('support_tickets')
          .select('*')
          .in('status', ['open', 'in_progress', 'waiting_customer'])
          .order('created_at', { ascending: false })
          .limit(10),
      ]);
      setStats(statsRes.data);
      setRecentConversations(convosRes.data || []);
      setOpenTickets(ticketsRes.data || []);
    } catch (e) {
      console.error('[Support] dashboard load failed:', e);
    } finally {
      setLoading(false);
    }
  }

  const sentimentIcon = (s: string) => {
    if (s === 'positive') return <i className="ri-emotion-happy-line text-gray-600" />;
    if (s === 'negative') return <i className="ri-emotion-unhappy-line text-red-500" />;
    return <i className="ri-emotion-normal-line text-gray-400" />;
  };

  const priorityBadge = (p: string) => {
    const colors: Record<string, string> = { urgent: 'bg-red-100 text-red-700', high: 'bg-orange-100 text-orange-700', medium: 'bg-blue-100 text-blue-700', low: 'bg-gray-100 text-gray-600' };
    return <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-full ${colors[p] || colors.medium}`}>{p}</span>;
  };

  const statusBadge = (s: string) => {
    const colors: Record<string, string> = { open: 'bg-blue-100 text-blue-700', in_progress: 'bg-yellow-100 text-yellow-700', waiting_customer: 'bg-purple-100 text-purple-700', resolved: 'bg-gray-100 text-gray-900', closed: 'bg-gray-100 text-gray-600' };
    return <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-full ${colors[s] || colors.open}`}>{s.replace(/_/g, ' ')}</span>;
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Support Hub</h1>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <div key={i} className="bg-white rounded-xl h-32 animate-pulse" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl h-96 animate-pulse" />
          <div className="bg-white rounded-xl h-96 animate-pulse" />
        </div>
      </div>
    );
  }

  const kpis = [
    { label: 'Open Tickets', value: stats?.tickets?.open || 0, icon: 'ri-ticket-line', color: 'gray', sub: `${stats?.tickets?.urgent || 0} urgent`, link: '/admin/support/tickets' },
    { label: "Today's Conversations", value: stats?.conversations?.today || 0, icon: 'ri-chat-3-line', color: 'blue', sub: `${stats?.conversations?.total || 0} total`, link: '/admin/support/conversations' },
    { label: 'AI Resolution Rate', value: `${stats?.ai_performance?.resolution_rate || 0}%`, icon: 'ri-robot-2-line', color: 'purple', sub: `${stats?.ai_performance?.escalated || 0} escalated`, link: '/admin/support/analytics' },
    { label: 'Avg Satisfaction', value: stats?.satisfaction?.avg_rating || '0', icon: 'ri-star-smile-line', color: 'amber', sub: `${stats?.satisfaction?.total_reviews || 0} reviews`, link: '/admin/support/analytics' },
  ];

  const colorMap: Record<string, { bg: string; icon: string; ring: string }> = {
    gray: { bg: 'bg-gray-50', icon: 'text-gray-700', ring: 'ring-gray-600/20' },
    blue: { bg: 'bg-blue-50', icon: 'text-blue-600', ring: 'ring-blue-500/20' },
    purple: { bg: 'bg-purple-50', icon: 'text-purple-600', ring: 'ring-purple-500/20' },
    amber: { bg: 'bg-amber-50', icon: 'text-amber-600', ring: 'ring-amber-500/20' },
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Support Hub</h1>
          <p className="text-sm text-gray-500 mt-1">AI-powered customer support intelligence center</p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/support/knowledge-base" className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium transition-colors">
            <i className="ri-book-open-line" /> Knowledge Base
          </Link>
          <Link href="/admin/support/analytics" className="inline-flex items-center gap-2 px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-900 text-sm font-medium transition-colors">
            <i className="ri-line-chart-line" /> Analytics
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi) => {
          const c = colorMap[kpi.color];
          return (
            <Link key={kpi.label} href={kpi.link} className="bg-white rounded-xl border border-gray-100 p-5 hover:shadow-md transition-all group">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{kpi.label}</p>
                  <p className="text-3xl font-bold text-gray-900 mt-2">{kpi.value}</p>
                  <p className="text-xs text-gray-400 mt-1">{kpi.sub}</p>
                </div>
                <div className={`w-11 h-11 rounded-xl ${c.bg} ring-1 ${c.ring} flex items-center justify-center group-hover:scale-110 transition-transform`}>
                  <i className={`${kpi.icon} text-xl ${c.icon}`} />
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Quick Stats Bar */}
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <div className="flex flex-wrap items-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <i className="ri-brain-line text-purple-500" />
            <span className="text-gray-500">AI Memories:</span>
            <span className="font-semibold text-gray-900">{stats?.ai_memories?.total || 0}</span>
            <span className="text-gray-400">across {stats?.ai_memories?.customers_with_memory || 0} customers</span>
          </div>
          <div className="flex items-center gap-2">
            <i className="ri-book-open-line text-blue-500" />
            <span className="text-gray-500">KB Articles:</span>
            <span className="font-semibold text-gray-900">{stats?.knowledge_base?.total_articles || 0}</span>
          </div>
          <div className="flex items-center gap-2">
            <i className="ri-chat-3-line text-gray-600" />
            <span className="text-gray-500">This Week:</span>
            <span className="font-semibold text-gray-900">{stats?.conversations?.week || 0} conversations</span>
          </div>
          <div className="flex items-center gap-2">
            <i className="ri-check-double-line text-gray-600" />
            <span className="text-gray-500">Resolved This Week:</span>
            <span className="font-semibold text-gray-900">{stats?.tickets?.resolved_week || 0} tickets</span>
          </div>
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent AI Conversations */}
        <div className="bg-white rounded-xl border border-gray-100">
          <div className="flex items-center justify-between p-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <i className="ri-chat-3-line text-blue-500" /> Recent Conversations
            </h2>
            <Link href="/admin/support/conversations" className="text-xs text-gray-700 hover:text-gray-900 font-medium">View all →</Link>
          </div>
          <div className="divide-y divide-gray-50">
            {recentConversations.length === 0 ? (
              <div className="p-8 text-center text-gray-400">
                <i className="ri-chat-off-line text-4xl mb-2 block" />
                <p className="text-sm">No conversations yet</p>
              </div>
            ) : recentConversations.map((conv) => (
              <Link key={conv.id} href={`/admin/support/conversations/${conv.id}`} className="flex items-start gap-3 p-4 hover:bg-gray-50 transition-colors">
                <div className="mt-0.5">{sentimentIcon(conv.sentiment || 'neutral')}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900 truncate">{conv.customer_name || conv.customer_email || conv.session_id?.slice(0, 12) || 'Anonymous'}</span>
                    {conv.category && <span className="px-1.5 py-0.5 text-[9px] font-semibold uppercase bg-gray-100 text-gray-500 rounded">{conv.category}</span>}
                  </div>
                  <p className="text-xs text-gray-500 truncate mt-0.5">{conv.summary || `${conv.message_count || 0} messages`}</p>
                  <p className="text-[10px] text-gray-400 mt-1">{new Date(conv.updated_at).toLocaleString()}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {conv.is_escalated && <span className="px-1.5 py-0.5 text-[9px] font-bold bg-red-100 text-red-600 rounded">ESCALATED</span>}
                  {conv.is_resolved && <span className="px-1.5 py-0.5 text-[9px] font-bold bg-gray-100 text-gray-700 rounded">RESOLVED</span>}
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Open Tickets */}
        <div className="bg-white rounded-xl border border-gray-100">
          <div className="flex items-center justify-between p-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <i className="ri-ticket-line text-gray-600" /> Open Tickets
            </h2>
            <Link href="/admin/support/tickets" className="text-xs text-gray-700 hover:text-gray-900 font-medium">View all →</Link>
          </div>
          <div className="divide-y divide-gray-50">
            {openTickets.length === 0 ? (
              <div className="p-8 text-center text-gray-400">
                <i className="ri-checkbox-circle-line text-4xl mb-2 block text-gray-300" />
                <p className="text-sm">All clear! No open tickets</p>
              </div>
            ) : openTickets.map((ticket) => (
              <Link key={ticket.id} href={`/admin/support/tickets/${ticket.id}`} className="flex items-start gap-3 p-4 hover:bg-gray-50 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono text-gray-400">{ticket.ticket_number}</span>
                    {priorityBadge(ticket.priority)}
                    {statusBadge(ticket.status)}
                  </div>
                  <p className="text-sm font-medium text-gray-900 mt-1 truncate">{ticket.subject}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{ticket.customer_name || ticket.customer_email || 'Unknown'}</p>
                </div>
                <span className="text-[10px] text-gray-400 whitespace-nowrap">{new Date(ticket.created_at).toLocaleDateString()}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Quick Actions</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Link href="/admin/support/tickets?new=1" className="flex flex-col items-center gap-2 p-4 rounded-lg border border-dashed border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-all text-center group">
            <i className="ri-add-circle-line text-2xl text-gray-400 group-hover:text-gray-700" />
            <span className="text-xs font-medium text-gray-600 group-hover:text-gray-900">Create Ticket</span>
          </Link>
          <Link href="/admin/support/knowledge-base?new=1" className="flex flex-col items-center gap-2 p-4 rounded-lg border border-dashed border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-all text-center group">
            <i className="ri-article-line text-2xl text-gray-400 group-hover:text-blue-600" />
            <span className="text-xs font-medium text-gray-600 group-hover:text-blue-700">Add KB Article</span>
          </Link>
          <Link href="/admin/support/conversations" className="flex flex-col items-center gap-2 p-4 rounded-lg border border-dashed border-gray-200 hover:border-purple-300 hover:bg-purple-50 transition-all text-center group">
            <i className="ri-search-line text-2xl text-gray-400 group-hover:text-purple-600" />
            <span className="text-xs font-medium text-gray-600 group-hover:text-purple-700">Search Chats</span>
          </Link>
          <Link href="/admin/support/analytics" className="flex flex-col items-center gap-2 p-4 rounded-lg border border-dashed border-gray-200 hover:border-amber-300 hover:bg-amber-50 transition-all text-center group">
            <i className="ri-pie-chart-line text-2xl text-gray-400 group-hover:text-amber-600" />
            <span className="text-xs font-medium text-gray-600 group-hover:text-amber-700">View Reports</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
