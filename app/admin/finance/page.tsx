'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';

type Summary = {
  month: string;
  range: { start: string; end: string };
  products_with_cop: number;
  avg_margin_pct: number | null;
  product_margins: Array<{
    product_id: string;
    name: string;
    slug: string;
    price: number;
    fabric_cost: number;
    other_cost: number;
    labour_cost: number;
    gross_cost: number;
    gross_profit: number;
    margin_pct: number | null;
    staff_name: string | null;
  }>;
  production: {
    total_labour_paid: number;
    total_pieces_logged: number;
    by_staff: Array<{ staff_id: string; full_name: string; pieces: number; labour_total: number }>;
  };
};

type StaffOpt = { id: string; full_name: string };
type ProductOpt = { id: string; name: string };

export default function FinancePage() {
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [staffList, setStaffList] = useState<StaffOpt[]>([]);
  const [products, setProducts] = useState<ProductOpt[]>([]);
  const [logStaff, setLogStaff] = useState('');
  const [logProduct, setLogProduct] = useState('');
  const [logQty, setLogQty] = useState('1');
  const [logUnitLabour, setLogUnitLabour] = useState('');
  const [logNotes, setLogNotes] = useState('');
  const [logSaving, setLogSaving] = useState(false);
  const [logMsg, setLogMsg] = useState('');

  const marginMap = useMemo(() => {
    const m = new Map<string, number>();
    summary?.product_margins.forEach((p) => m.set(p.product_id, p.labour_cost));
    return m;
  }, [summary]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const { fetchWithTimeout } = await import('@/lib/fetch-timeout');
        const res = await fetchWithTimeout(
          `/api/admin/finance/summary?month=${encodeURIComponent(month)}`,
          { credentials: 'include', timeoutMs: 20_000 }
        );
        const json = await res.json();
        if (res.ok) setSummary(json);
        else setSummary(null);
      } catch {
        setSummary(null);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [month]);

  useEffect(() => {
    async function loadOpts() {
      try {
        const { fetchWithTimeout } = await import('@/lib/fetch-timeout');
        const [sRes, pRes] = await Promise.all([
          fetchWithTimeout('/api/admin/production-staff?active=1', {
            credentials: 'include',
            timeoutMs: 15_000,
          }),
          // lite=1: id+name only — not full product+images dump
          fetchWithTimeout('/api/admin/products?lite=1&limit=1000', {
            credentials: 'include',
            timeoutMs: 15_000,
          }),
        ]);
        const sJson = await sRes.json().catch(() => ({}));
        const pJson = await pRes.json().catch(() => []);
        if (sRes.ok && Array.isArray(sJson.data)) {
          setStaffList(sJson.data.map((x: any) => ({ id: x.id, full_name: x.full_name })));
        }
        if (pRes.ok && Array.isArray(pJson)) {
          setProducts(pJson.map((x: any) => ({ id: x.id, name: x.name })));
        }
      } catch (e) {
        console.error('[Finance] options load failed:', e);
      }
    }
    loadOpts();
  }, []);

  useEffect(() => {
    if (!logProduct) return;
    const lab = marginMap.get(logProduct);
    if (lab != null && lab > 0) setLogUnitLabour(String(lab));
  }, [logProduct, marginMap]);

  async function submitLog(e: React.FormEvent) {
    e.preventDefault();
    setLogMsg('');
    if (!logStaff || !logProduct) {
      setLogMsg('Choose staff and product.');
      return;
    }
    const qty = parseInt(logQty, 10);
    const unit = parseFloat(logUnitLabour);
    if (!qty || qty < 1 || !Number.isFinite(unit) || unit < 0) {
      setLogMsg('Enter valid quantity and unit labour.');
      return;
    }
    setLogSaving(true);
    try {
      const res = await fetch('/api/admin/production-logs', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          production_staff_id: logStaff,
          product_id: logProduct,
          quantity: qty,
          unit_labour_cost: unit,
          logged_for: `${month}-01`,
          notes: logNotes.trim() || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed');
      setLogMsg('Production logged.');
      setLogQty('1');
      setLogNotes('');
      const refresh = await fetch(`/api/admin/finance/summary?month=${encodeURIComponent(month)}`, {
        credentials: 'include',
      });
      const sj = await refresh.json();
      if (refresh.ok) setSummary(sj);
    } catch (err: any) {
      setLogMsg(err.message || 'Failed');
    } finally {
      setLogSaving(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Finance & production</h1>
          <p className="text-gray-600 mt-1">
            Cost of production, retail margins, and labour totals from logged output.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm font-semibold text-gray-700">
            Month
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="ml-2 px-3 py-2 border border-gray-300 rounded-lg"
            />
          </label>
          <Link
            href="/admin/finance/staff"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-green text-white text-sm font-semibold hover:opacity-90"
          >
            <i className="ri-team-line" />
            Production team (HRM)
          </Link>
        </div>
      </div>

      {loading ? (
        <p className="text-gray-500">Loading…</p>
      ) : !summary ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900 text-sm">
          Could not load finance data. If you just deployed, run the database migration{' '}
          <code className="text-xs">20260417000000_finance_cop.sql</code> on Supabase.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold text-gray-500 uppercase">Active products with COP</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{summary.products_with_cop}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold text-gray-500 uppercase">Avg. margin (COP products)</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {summary.avg_margin_pct != null ? `${summary.avg_margin_pct.toFixed(1)}%` : '—'}
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold text-gray-500 uppercase">Labour paid (logged)</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                GH₵ {summary.production.total_labour_paid.toFixed(2)}
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold text-gray-500 uppercase">Pieces logged (month)</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{summary.production.total_pieces_logged}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="font-bold text-gray-900">Product margins</h2>
                <p className="text-sm text-gray-500">Retail price vs gross cost (fabric + other + labour)</p>
              </div>
              <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="text-left py-2 px-3 font-semibold text-gray-700">Product</th>
                      <th className="text-right py-2 px-3 font-semibold text-gray-700">Price</th>
                      <th className="text-right py-2 px-3 font-semibold text-gray-700">Gross cost</th>
                      <th className="text-right py-2 px-3 font-semibold text-gray-700">Profit</th>
                      <th className="text-right py-2 px-3 font-semibold text-gray-700">Margin</th>
                      <th className="text-left py-2 px-3 font-semibold text-gray-700">Staff</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.product_margins.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 px-3 text-center text-gray-500">
                          No cost of production data yet. Enable COP on a product under the COP tab.
                        </td>
                      </tr>
                    ) : (
                      summary.product_margins.map((p) => (
                        <tr key={p.product_id} className="border-t border-gray-100">
                          <td className="py-2 px-3 font-medium text-gray-900">{p.name}</td>
                          <td className="py-2 px-3 text-right">GH₵ {p.price.toFixed(2)}</td>
                          <td className="py-2 px-3 text-right">GH₵ {p.gross_cost.toFixed(2)}</td>
                          <td
                            className={`py-2 px-3 text-right font-medium ${
                              p.gross_profit >= 0 ? 'text-emerald-700' : 'text-red-600'
                            }`}
                          >
                            GH₵ {p.gross_profit.toFixed(2)}
                          </td>
                          <td className="py-2 px-3 text-right">
                            {p.margin_pct != null ? `${p.margin_pct.toFixed(1)}%` : '—'}
                          </td>
                          <td className="py-2 px-3 text-gray-600">{p.staff_name || '—'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="space-y-6">
              <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
                <div className="px-5 py-4 border-b border-gray-100">
                  <h2 className="font-bold text-gray-900">Labour by staff (this month)</h2>
                  <p className="text-sm text-gray-500">From production logs — pieces × unit labour</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left py-2 px-3 font-semibold text-gray-700">Staff</th>
                        <th className="text-right py-2 px-3 font-semibold text-gray-700">Pieces</th>
                        <th className="text-right py-2 px-3 font-semibold text-gray-700">Labour total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.production.by_staff.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="py-6 px-3 text-center text-gray-500">
                            No production logged for this month.
                          </td>
                        </tr>
                      ) : (
                        summary.production.by_staff.map((s) => (
                          <tr key={s.staff_id} className="border-t border-gray-100">
                            <td className="py-2 px-3 font-medium">{s.full_name}</td>
                            <td className="py-2 px-3 text-right">{s.pieces}</td>
                            <td className="py-2 px-3 text-right font-semibold">
                              GH₵ {s.labour_total.toFixed(2)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <h2 className="font-bold text-gray-900 mb-1">Log production</h2>
                <p className="text-sm text-gray-500 mb-4">
                  Record how many units a tailor completed. Unit labour defaults from the product COP when available.
                </p>
                <form onSubmit={submitLog} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Staff</label>
                      <select
                        required
                        value={logStaff}
                        onChange={(e) => setLogStaff(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      >
                        <option value="">Select…</option>
                        {staffList.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.full_name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Product</label>
                      <select
                        required
                        value={logProduct}
                        onChange={(e) => setLogProduct(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      >
                        <option value="">Select…</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Quantity</label>
                      <input
                        type="number"
                        min={1}
                        value={logQty}
                        onChange={(e) => setLogQty(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Unit labour (GH₵)</label>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={logUnitLabour}
                        onChange={(e) => setLogUnitLabour(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Notes (optional)</label>
                    <input
                      value={logNotes}
                      onChange={(e) => setLogNotes(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      placeholder="Batch / style notes"
                    />
                  </div>
                  {logMsg && (
                    <p className={`text-sm ${logMsg.startsWith('Production') ? 'text-emerald-600' : 'text-red-600'}`}>
                      {logMsg}
                    </p>
                  )}
                  <button
                    type="submit"
                    disabled={logSaving}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-semibold disabled:opacity-50"
                  >
                    {logSaving ? 'Saving…' : 'Save log'}
                  </button>
                </form>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
