'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { fetchWithTimeout } from '@/lib/fetch-timeout';
import { money, moneyLabel } from '@/lib/format-money';

function todayAccra(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Accra' });
}

function pctChange(current: number, previous: number): string {
  if (!previous && !current) return '0%';
  if (!previous) return '+100%';
  const p = ((current - previous) / previous) * 100;
  const sign = p > 0 ? '+' : '';
  return `${sign}${p.toFixed(0)}%`;
}

export default function EndOfDayPage() {
  const [date, setDate] = useState(todayAccra);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);
  const [channelFilter, setChannelFilter] = useState<'all' | 'website' | 'pos'>('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithTimeout(
        `/api/admin/end-of-day?date=${encodeURIComponent(date)}`,
        { credentials: 'include', timeoutMs: 25_000 }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.success === false) {
        throw new Error(json?.error?.message || json?.error || 'Failed to load end-of-day report');
      }
      setData(json);
    } catch (e: any) {
      setError(e?.message || 'Unable to load report');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  const products = useMemo(() => {
    const list = data?.products || [];
    if (channelFilter === 'all') return list;
    return list.filter((p: any) => p.channel === channelFilter || p.channel === 'both');
  }, [data, channelFilter]);

  const orders = useMemo(() => {
    const list = data?.orders || [];
    if (channelFilter === 'all') return list;
    return list.filter((o: any) => o.channel === channelFilter);
  }, [data, channelFilter]);

  const s = data?.summary || {};
  const c = data?.comparison || {};

  function exportCsv() {
    if (!data) return;
    const rows = [
      ['Product', 'Variant', 'Units', 'Revenue', 'Website units', 'POS units', 'Stock left', 'Channel'],
      ...products.map((p: any) => [
        p.product_name,
        p.variant_name || '',
        p.units_sold,
        p.revenue,
        p.web_units,
        p.pos_units,
        p.stock_remaining ?? '',
        p.channel,
      ]),
    ];
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `end-of-day-${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Loading end-of-day report…</div>;
  }

  if (error) {
    return (
      <div className="p-8 max-w-lg mx-auto text-center space-y-4">
        <p className="font-semibold text-gray-900">Report unavailable</p>
        <p className="text-sm text-gray-500">{error}</p>
        <button type="button" onClick={load} className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm">
          Retry
        </button>
      </div>
    );
  }

  const strengthLabel: Record<string, string> = {
    quiet: 'Quiet day',
    soft: 'Soft day',
    good: 'Good day',
    strong: 'Strong day',
  };

  return (
    <div className="min-h-screen bg-gray-50 print:bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-8 print:mb-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">End of Day</h1>
            <p className="text-gray-600 mt-1 text-sm">
              Sales, stock movement, website vs POS — {data?.timezone || 'Africa/Accra'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 print:hidden">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="px-3 py-2 border-2 border-gray-300 rounded-lg text-sm"
            />
            <select
              value={channelFilter}
              onChange={(e) => setChannelFilter(e.target.value as any)}
              className="px-3 py-2 border-2 border-gray-300 rounded-lg text-sm"
            >
              <option value="all">All channels</option>
              <option value="website">Website only</option>
              <option value="pos">POS only</option>
            </select>
            <button
              type="button"
              onClick={exportCsv}
              className="px-4 py-2 rounded-lg border-2 border-gray-300 text-sm font-semibold"
            >
              Export CSV
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-semibold"
            >
              Print / PDF
            </button>
            <Link href="/admin" className="px-4 py-2 rounded-lg border-2 border-gray-300 text-sm font-semibold">
              Dashboard
            </Link>
          </div>
        </div>

        <div className="mb-6 flex items-center gap-3">
          <span className="text-lg font-bold text-gray-900">{date}</span>
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
            {strengthLabel[s.dayStrength] || 'Day report'}
          </span>
        </div>

        {/* Money summary */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCard title="Total paid sales" value={moneyLabel(s.grossPaid || 0)} sub={`${s.paidOrders || 0} paid orders`} />
          <StatCard title="Website" value={moneyLabel(s.webRevenue || 0)} sub={`${s.webPaidOrders || 0} orders`} />
          <StatCard title="POS" value={moneyLabel(s.posRevenue || 0)} sub={`${s.posPaidOrders || 0} orders`} />
          <StatCard title="Avg order value" value={moneyLabel(s.aov || 0)} sub={`Discounts GH₵ ${money(s.discounts || 0)}`} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard title="Unpaid / abandoned" value={String(s.unpaidOrders || 0)} sub={`${s.cancelledOrders || 0} cancelled`} />
          <StatCard title="Preorders paid" value={String(s.preorderPaid || 0)} sub={`${s.pendingFulfillment || 0} still to fulfill`} />
          <StatCard title="New customers" value={String(s.newCustomers || 0)} sub={`${s.guestPaidOrders || 0} guest paid orders`} />
          <StatCard
            title="vs yesterday"
            value={pctChange(Number(s.grossPaid) || 0, Number(c.yesterdayRevenue) || 0)}
            sub={`Yesterday ${moneyLabel(c.yesterdayRevenue || 0)} · Last week ${moneyLabel(c.lastWeekSameDayRevenue || 0)}`}
          />
        </div>

        {/* Payments */}
        <section className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Payment mix</h2>
          {(data?.payments || []).length === 0 ? (
            <p className="text-sm text-gray-500">No paid payments this day.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-600 border-b">
                    <th className="py-2 pr-4">Method</th>
                    <th className="py-2 pr-4">Channel</th>
                    <th className="py-2 pr-4">Orders</th>
                    <th className="py-2">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.payments || []).map((p: any, i: number) => (
                    <tr key={i} className="border-b border-gray-50">
                      <td className="py-2 pr-4 font-medium capitalize">{p.payment_method}</td>
                      <td className="py-2 pr-4 capitalize">{p.channel}</td>
                      <td className="py-2 pr-4">{p.orders}</td>
                      <td className="py-2 font-semibold">{moneyLabel(p.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Products sold */}
        <section className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">Products sold</h2>
            <span className="text-xs text-gray-500">{products.length} lines</span>
          </div>
          {products.length === 0 ? (
            <p className="text-sm text-gray-500">No paid product sales this day.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-600 border-b">
                    <th className="py-2 pr-3">Product</th>
                    <th className="py-2 pr-3">Variant</th>
                    <th className="py-2 pr-3">Units</th>
                    <th className="py-2 pr-3">Web</th>
                    <th className="py-2 pr-3">POS</th>
                    <th className="py-2 pr-3">Revenue</th>
                    <th className="py-2">Stock left</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p: any, i: number) => (
                    <tr key={i} className="border-b border-gray-50">
                      <td className="py-2 pr-3 font-medium text-gray-900">{p.product_name}</td>
                      <td className="py-2 pr-3 text-gray-600">{p.variant_name || '—'}</td>
                      <td className="py-2 pr-3">{p.units_sold}</td>
                      <td className="py-2 pr-3">{p.web_units}</td>
                      <td className="py-2 pr-3">{p.pos_units}</td>
                      <td className="py-2 pr-3 font-semibold">{moneyLabel(p.revenue)}</td>
                      <td className="py-2">
                        <span
                          className={
                            Number(p.stock_remaining) <= 0
                              ? 'text-red-600 font-semibold'
                              : Number(p.stock_remaining) < 10
                                ? 'text-amber-700 font-semibold'
                                : 'text-gray-800'
                          }
                        >
                          {p.stock_remaining ?? '—'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Low stock after sales */}
        {(data?.lowStockAfterSale || []).length > 0 && (
          <section className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-6">
            <h2 className="text-lg font-bold text-amber-900 mb-3">Low stock after today&apos;s sales</h2>
            <ul className="space-y-1 text-sm text-amber-900">
              {data.lowStockAfterSale.map((p: any, i: number) => (
                <li key={i}>
                  {p.product_name}
                  {p.variant_name ? ` (${p.variant_name})` : ''} — {p.stock_remaining} left
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Staff POS */}
        {(data?.staffPos || []).length > 0 && (
          <section className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">POS by staff</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-600 border-b">
                    <th className="py-2 pr-4">Staff</th>
                    <th className="py-2 pr-4">Orders</th>
                    <th className="py-2">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {data.staffPos.map((st: any) => (
                    <tr key={st.staff_id} className="border-b border-gray-50">
                      <td className="py-2 pr-4 font-medium">{st.full_name}</td>
                      <td className="py-2 pr-4">{st.orders}</td>
                      <td className="py-2 font-semibold">{moneyLabel(st.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Orders list */}
        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Orders ({orders.length})</h2>
          {orders.length === 0 ? (
            <p className="text-sm text-gray-500">No orders this day.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-600 border-b">
                    <th className="py-2 pr-3">Order</th>
                    <th className="py-2 pr-3">Time</th>
                    <th className="py-2 pr-3">Channel</th>
                    <th className="py-2 pr-3">Payment</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o: any) => (
                    <tr key={o.id} className="border-b border-gray-50">
                      <td className="py-2 pr-3">
                        <Link href={`/admin/orders/${o.id}`} className="text-gray-900 font-medium hover:underline">
                          {o.order_number}
                        </Link>
                        {o.is_preorder ? (
                          <span className="ml-2 text-[10px] uppercase font-bold text-amber-700">Preorder</span>
                        ) : null}
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {new Date(o.created_at).toLocaleTimeString('en-GB', {
                          hour: '2-digit',
                          minute: '2-digit',
                          timeZone: 'Africa/Accra',
                        })}
                      </td>
                      <td className="py-2 pr-3 capitalize">{o.channel}</td>
                      <td className="py-2 pr-3">
                        <span className="capitalize">{o.payment_method || '—'}</span>
                        <span className="text-gray-400"> · </span>
                        <span className="capitalize">{o.payment_status}</span>
                      </td>
                      <td className="py-2 pr-3 capitalize">{o.status}</td>
                      <td className="py-2 font-semibold">{moneyLabel(o.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function StatCard({ title, value, sub }: { title: string; value: string; sub: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <p className="text-sm text-gray-600 mb-1">{title}</p>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-500 mt-2">{sub}</p>
    </div>
  );
}
