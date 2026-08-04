'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend } from 'recharts';

const COLORS = ['#171717', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

export default function SupportAnalyticsPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    try {
      const { fetchWithTimeout } = await import('@/lib/fetch-timeout');
      const res = await fetchWithTimeout(`/api/support/analytics?days=${days}`, { timeoutMs: 20_000 });
      const json = await res.json();
      setData(json);
    } catch (e) {
      console.error('[Support analytics]', e);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { fetchAnalytics(); }, [fetchAnalytics]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Support Analytics</h1>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => <div key={i} className="bg-white rounded-xl h-40 animate-pulse" />)}
        </div>
      </div>
    );
  }

  const s = data?.summary || {};
  const catData = Object.entries(data?.categoryBreakdown || {}).map(([name, value]) => ({ name, value }));
  const sentData = [
    { name: 'Positive', value: data?.sentimentBreakdown?.positive || 0 },
    { name: 'Neutral', value: data?.sentimentBreakdown?.neutral || 0 },
    { name: 'Negative', value: data?.sentimentBreakdown?.negative || 0 },
  ];
  const ratingData = (data?.ratingDistribution || [0, 0, 0, 0, 0]).map((count: number, i: number) => ({ name: `${i + 1} Star`, count }));
  const ticketStatusData = Object.entries(data?.ticketStatusBreakdown || {}).map(([name, value]) => ({ name: name.replace(/_/g, ' '), value }));
  const sentColors = ['#171717', '#94a3b8', '#ef4444'];

  const aiRate = s.totalConversations > 0 ? ((s.aiHandled / s.totalConversations) * 100).toFixed(0) : '0';
  const escalationRate = s.totalConversations > 0 ? ((s.escalated / s.totalConversations) * 100).toFixed(0) : '0';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
            <Link href="/admin/support" className="hover:text-gray-700">Support</Link>
            <i className="ri-arrow-right-s-line text-xs" />
            <span className="text-gray-900 font-medium">Analytics</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Support Analytics</h1>
        </div>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-600">
          <option value={7}>Last 7 days</option>
          <option value={14}>Last 14 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { label: 'Conversations', value: s.totalConversations, icon: 'ri-chat-3-line', color: 'text-blue-600 bg-blue-50' },
          { label: 'Tickets', value: s.totalTickets, icon: 'ri-ticket-line', color: 'text-gray-700 bg-gray-50' },
          { label: 'AI Handled', value: `${aiRate}%`, icon: 'ri-robot-2-line', color: 'text-purple-600 bg-purple-50' },
          { label: 'Escalated', value: `${escalationRate}%`, icon: 'ri-alarm-warning-line', color: 'text-orange-600 bg-orange-50' },
          { label: 'Avg Rating', value: s.avgRating, icon: 'ri-star-line', color: 'text-amber-600 bg-amber-50' },
          { label: 'Avg Resolution', value: `${s.avgResolutionHours}h`, icon: 'ri-time-line', color: 'text-cyan-600 bg-cyan-50' },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-white rounded-xl border border-gray-100 p-4">
            <div className={`w-9 h-9 rounded-lg ${kpi.color} flex items-center justify-center mb-2`}>
              <i className={`${kpi.icon} text-lg`} />
            </div>
            <p className="text-2xl font-bold text-gray-900">{kpi.value}</p>
            <p className="text-[10px] text-gray-500 uppercase tracking-wide font-medium mt-0.5">{kpi.label}</p>
          </div>
        ))}
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sentiment Distribution */}
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Sentiment Distribution</h3>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={sentData} cx="50%" cy="50%" outerRadius={80} innerRadius={40} paddingAngle={5} dataKey="value" label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}>
                  {sentData.map((_, i) => <Cell key={`cell-${i}`} fill={sentColors[i]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Rating Distribution */}
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Customer Satisfaction Ratings</h3>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ratingData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#171717" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Category Breakdown */}
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Top Conversation Categories</h3>
          {catData.length === 0 ? (
            <div className="h-[250px] flex items-center justify-center text-gray-400 text-sm">No category data yet</div>
          ) : (
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={catData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={100} />
                  <Tooltip />
                  <Bar dataKey="value" fill="#3b82f6" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Ticket Status */}
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Ticket Status Breakdown</h3>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={ticketStatusData} cx="50%" cy="50%" outerRadius={80} innerRadius={40} paddingAngle={5} dataKey="value" label={({ name, value }) => value > 0 ? `${name}: ${value}` : ''}>
                  {ticketStatusData.map((_, i) => <Cell key={`cell-${i}`} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Daily Trends */}
      {data?.dailyData?.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Daily Trends</h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.dailyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="total_conversations" name="Conversations" stroke="#3b82f6" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="total_tickets_created" name="Tickets Created" stroke="#ef4444" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="total_tickets_resolved" name="Tickets Resolved" stroke="#171717" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* AI Performance Card */}
      <div className="bg-gradient-to-r from-purple-600 to-indigo-600 rounded-xl p-6 text-white">
        <h3 className="text-lg font-bold mb-4 flex items-center gap-2"><i className="ri-robot-2-line" /> AI Performance Summary</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
          <div>
            <p className="text-3xl font-bold">{s.aiHandled}</p>
            <p className="text-purple-200 text-xs mt-1">Conversations handled by AI</p>
          </div>
          <div>
            <p className="text-3xl font-bold">{s.escalated}</p>
            <p className="text-purple-200 text-xs mt-1">Escalated to human</p>
          </div>
          <div>
            <p className="text-3xl font-bold">{s.resolved}</p>
            <p className="text-purple-200 text-xs mt-1">Auto-resolved by AI</p>
          </div>
          <div>
            <p className="text-3xl font-bold">{s.avgFirstResponseMinutes}m</p>
            <p className="text-purple-200 text-xs mt-1">Avg first response time</p>
          </div>
        </div>
      </div>
    </div>
  );
}
