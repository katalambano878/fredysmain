'use client';

import { useState, useEffect, useMemo } from 'react';

interface Coupon {
  id: string;
  code: string;
  type: 'percentage' | 'fixed_amount' | 'free_shipping';
  value: number;
  description: string | null;
  minimum_purchase: number;
  maximum_discount: number | null;
  usage_limit: number | null;
  usage_count: number;
  per_user_limit: number;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
  created_at: string;
}

const EMPTY_FORM = {
  code: '',
  type: 'percentage' as Coupon['type'],
  value: '',
  description: '',
  minimum_purchase: '',
  maximum_discount: '',
  usage_limit: '',
  per_user_limit: '1',
  start_date: '',
  end_date: '',
  is_active: true,
};

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'FREBY';
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function toDateInput(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toISOString().split('T')[0];
}

function derivedStatus(c: Coupon): 'Active' | 'Expired' | 'Scheduled' | 'Disabled' {
  if (!c.is_active) return 'Disabled';
  const now = new Date();
  if (c.start_date && new Date(c.start_date) > now) return 'Scheduled';
  if (c.end_date && new Date(c.end_date) < now) return 'Expired';
  if (c.usage_limit && c.usage_count >= c.usage_limit) return 'Expired';
  return 'Active';
}

const statusColors: Record<string, string> = {
  Active: 'bg-green-100 text-green-800',
  Scheduled: 'bg-blue-100 text-blue-700',
  Expired: 'bg-gray-100 text-gray-600',
  Disabled: 'bg-red-100 text-red-700',
};

const typeLabels: Record<string, string> = {
  percentage: 'Percentage',
  fixed_amount: 'Fixed Amount',
  free_shipping: 'Free Shipping',
};

export default function AdminCouponsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('date');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => { fetchCoupons(); }, []);

  const fetchCoupons = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/coupons', { credentials: 'include' });
      const json = await res.json();
      if (res.ok) setCoupons(json.coupons || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, code: generateCode() });
    setShowModal(true);
  };

  const openEdit = (c: Coupon) => {
    setEditingId(c.id);
    setForm({
      code: c.code,
      type: c.type,
      value: String(c.value),
      description: c.description || '',
      minimum_purchase: c.minimum_purchase ? String(c.minimum_purchase) : '',
      maximum_discount: c.maximum_discount ? String(c.maximum_discount) : '',
      usage_limit: c.usage_limit ? String(c.usage_limit) : '',
      per_user_limit: String(c.per_user_limit || 1),
      start_date: toDateInput(c.start_date),
      end_date: toDateInput(c.end_date),
      is_active: c.is_active,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.code.trim()) return;
    if (form.type !== 'free_shipping' && !form.value) return;
    setSaving(true);
    try {
      const payload: any = {
        code: form.code,
        type: form.type,
        value: form.type === 'free_shipping' ? 0 : Number(form.value),
        description: form.description || null,
        minimum_purchase: Number(form.minimum_purchase) || 0,
        maximum_discount: form.maximum_discount ? Number(form.maximum_discount) : null,
        usage_limit: form.usage_limit ? Number(form.usage_limit) : null,
        per_user_limit: Number(form.per_user_limit) || 1,
        start_date: form.start_date ? new Date(form.start_date).toISOString() : new Date().toISOString(),
        end_date: form.end_date ? new Date(form.end_date + 'T23:59:59').toISOString() : null,
        is_active: form.is_active,
      };

      if (editingId) payload.id = editingId;

      const res = await fetch('/api/admin/coupons', {
        method: editingId ? 'PATCH' : 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed');

      if (editingId) {
        setCoupons(prev => prev.map(c => c.id === editingId ? json.coupon : c));
        showToast('Coupon updated');
      } else {
        setCoupons(prev => [json.coupon, ...prev]);
        showToast('Coupon created');
      }
      setShowModal(false);
    } catch (err: any) {
      alert(err.message || 'Something went wrong');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this coupon? This cannot be undone.')) return;
    try {
      const res = await fetch('/api/admin/coupons', {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error('Failed');
      setCoupons(prev => prev.filter(c => c.id !== id));
      showToast('Coupon deleted');
    } catch {
      alert('Failed to delete coupon');
    }
  };

  const toggleActive = async (c: Coupon) => {
    const newActive = !c.is_active;
    setCoupons(prev => prev.map(x => x.id === c.id ? { ...x, is_active: newActive } : x));
    try {
      await fetch('/api/admin/coupons', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: c.id, is_active: newActive }),
      });
      showToast(newActive ? 'Coupon activated' : 'Coupon disabled');
    } catch {
      setCoupons(prev => prev.map(x => x.id === c.id ? { ...x, is_active: c.is_active } : x));
    }
  };

  const copyCode = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const filtered = useMemo(() => {
    let list = coupons.map(c => ({ ...c, _status: derivedStatus(c) }));
    if (statusFilter !== 'all') list = list.filter(c => c._status === statusFilter);
    if (sortBy === 'usage') list.sort((a, b) => b.usage_count - a.usage_count);
    else if (sortBy === 'value') list.sort((a, b) => b.value - a.value);
    return list;
  }, [coupons, statusFilter, sortBy]);

  const activeCoupons = coupons.filter(c => derivedStatus(c) === 'Active');
  const totalUses = coupons.reduce((sum, c) => sum + (c.usage_count || 0), 0);
  const totalDiscount = coupons.reduce((sum, c) => {
    if (c.type === 'fixed_amount') return sum + (c.usage_count || 0) * c.value;
    return sum;
  }, 0);

  return (
    <div className="space-y-6">
      {toast && (
        <div className="fixed top-4 right-4 z-[60] flex items-center gap-2 bg-green-50 border border-green-200 text-green-800 px-5 py-3 rounded-xl shadow-lg animate-fade-in">
          <i className="ri-check-line text-lg"></i> {toast}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Coupons & Promotions</h1>
          <p className="text-gray-600 mt-1">Create and manage discount codes</p>
        </div>
        <button onClick={openCreate} className="bg-gray-900 hover:bg-gray-800 text-white px-6 py-3 rounded-lg font-semibold transition-colors whitespace-nowrap cursor-pointer">
          <i className="ri-add-line mr-2"></i>
          Create Coupon
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border-2 border-gray-200 p-4">
          <p className="text-sm text-gray-600 mb-1">Total Coupons</p>
          <p className="text-2xl font-bold text-gray-900">{coupons.length}</p>
        </div>
        <div className="bg-white rounded-xl border-2 border-gray-200 p-4">
          <p className="text-sm text-gray-600 mb-1">Active</p>
          <p className="text-2xl font-bold text-green-700">{activeCoupons.length}</p>
        </div>
        <div className="bg-white rounded-xl border-2 border-gray-200 p-4">
          <p className="text-sm text-gray-600 mb-1">Total Uses</p>
          <p className="text-2xl font-bold text-gray-900">{totalUses}</p>
        </div>
        <div className="bg-white rounded-xl border-2 border-gray-200 p-4">
          <p className="text-sm text-gray-600 mb-1">Total Discount</p>
          <p className="text-2xl font-bold text-purple-700">GH₵ {totalDiscount.toFixed(2)}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h2 className="text-lg font-bold text-gray-900">All Coupons</h2>
            <div className="flex items-center space-x-3">
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-4 py-2 pr-8 border-2 border-gray-300 rounded-lg text-sm font-medium cursor-pointer">
                <option value="all">All Status</option>
                <option value="Active">Active</option>
                <option value="Scheduled">Scheduled</option>
                <option value="Expired">Expired</option>
                <option value="Disabled">Disabled</option>
              </select>
              <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="px-4 py-2 pr-8 border-2 border-gray-300 rounded-lg text-sm font-medium cursor-pointer">
                <option value="date">Sort by Date</option>
                <option value="usage">Sort by Usage</option>
                <option value="value">Sort by Value</option>
              </select>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left py-4 px-6 text-sm font-semibold text-gray-700">Code</th>
                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Type</th>
                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Value</th>
                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Min Purchase</th>
                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Usage</th>
                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Valid Period</th>
                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Status</th>
                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="p-8 text-center text-gray-500"><i className="ri-loader-4-line animate-spin text-2xl"></i><p className="mt-2">Loading coupons...</p></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="p-8 text-center text-gray-500"><i className="ri-coupon-3-line text-4xl text-gray-300"></i><p className="mt-2">No coupons found.</p></td></tr>
              ) : filtered.map(coupon => {
                const status = coupon._status;
                return (
                  <tr key={coupon.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="py-4 px-6">
                      <div className="flex items-center space-x-2">
                        <span className="font-mono font-bold text-gray-900 bg-gray-100 px-3 py-1 rounded">{coupon.code}</span>
                        <button onClick={() => copyCode(coupon.code, coupon.id)} className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-900 hover:bg-gray-50 rounded transition-colors cursor-pointer" title="Copy code">
                          <i className={copiedId === coupon.id ? 'ri-check-line text-green-600' : 'ri-file-copy-line'}></i>
                        </button>
                      </div>
                      {coupon.description && <p className="text-xs text-gray-500 mt-1 max-w-[180px] truncate">{coupon.description}</p>}
                    </td>
                    <td className="py-4 px-4 text-gray-700 text-sm">{typeLabels[coupon.type] || coupon.type}</td>
                    <td className="py-4 px-4 font-semibold text-gray-900">
                      {coupon.type === 'percentage' ? `${coupon.value}%` : coupon.type === 'fixed_amount' ? `GH₵ ${coupon.value}` : 'Free'}
                    </td>
                    <td className="py-4 px-4 text-gray-700 whitespace-nowrap">
                      {coupon.minimum_purchase > 0 ? `GH₵ ${coupon.minimum_purchase.toFixed(2)}` : 'None'}
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center space-x-1">
                        <span className="text-gray-900 font-semibold">{coupon.usage_count}</span>
                        <span className="text-gray-400">/</span>
                        <span className="text-gray-600">{coupon.usage_limit || '∞'}</span>
                      </div>
                      {coupon.usage_limit && (
                        <div className="w-20 h-1.5 bg-gray-200 rounded-full mt-1.5">
                          <div className="h-full bg-gray-700 rounded-full" style={{ width: `${Math.min((coupon.usage_count / coupon.usage_limit) * 100, 100)}%` }}></div>
                        </div>
                      )}
                    </td>
                    <td className="py-4 px-4">
                      <p className="text-sm text-gray-700 whitespace-nowrap">{coupon.start_date ? new Date(coupon.start_date).toLocaleDateString() : '—'}</p>
                      <p className="text-sm text-gray-500 whitespace-nowrap">{coupon.end_date ? new Date(coupon.end_date).toLocaleDateString() : 'No expiry'}</p>
                    </td>
                    <td className="py-4 px-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${statusColors[status]}`}>{status}</span>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center space-x-1">
                        <button onClick={() => toggleActive(coupon)} className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors cursor-pointer ${coupon.is_active ? 'text-green-700 hover:bg-green-50' : 'text-gray-400 hover:bg-gray-100'}`} title={coupon.is_active ? 'Disable' : 'Enable'}>
                          <i className={coupon.is_active ? 'ri-toggle-fill text-xl' : 'ri-toggle-line text-xl'}></i>
                        </button>
                        <button onClick={() => openEdit(coupon)} className="w-8 h-8 flex items-center justify-center text-gray-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer" title="Edit">
                          <i className="ri-edit-line text-lg"></i>
                        </button>
                        <button onClick={() => handleDelete(coupon.id)} className="w-8 h-8 flex items-center justify-center text-gray-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors cursor-pointer" title="Delete">
                          <i className="ri-delete-bin-line text-lg"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">{editingId ? 'Edit Coupon' : 'Create Coupon'}</h2>
              <button onClick={() => setShowModal(false)} className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-900 rounded-lg hover:bg-gray-100 cursor-pointer">
                <i className="ri-close-line text-xl"></i>
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Code */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Coupon Code</label>
                <div className="flex gap-2">
                  <input type="text" value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="e.g. SAVE20" className="flex-1 px-4 py-2.5 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600 font-mono font-bold uppercase" />
                  <button type="button" onClick={() => setForm({ ...form, code: generateCode() })} className="px-3 py-2.5 border-2 border-gray-300 rounded-lg hover:bg-gray-50 text-sm cursor-pointer" title="Generate random code">
                    <i className="ri-refresh-line"></i>
                  </button>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Description <span className="text-gray-400 font-normal">(optional)</span></label>
                <input type="text" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="e.g. Summer sale 20% off" className="w-full px-4 py-2.5 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600" />
              </div>

              {/* Type & Value */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Discount Type</label>
                  <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value as Coupon['type'] })} className="w-full px-4 py-2.5 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600 cursor-pointer">
                    <option value="percentage">Percentage (%)</option>
                    <option value="fixed_amount">Fixed Amount (GH₵)</option>
                    <option value="free_shipping">Free Shipping</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    {form.type === 'percentage' ? 'Percentage (%)' : form.type === 'fixed_amount' ? 'Amount (GH₵)' : 'Value'}
                  </label>
                  <input type="number" min="0" max={form.type === 'percentage' ? 100 : undefined} step="0.01" value={form.type === 'free_shipping' ? '' : form.value} onChange={e => setForm({ ...form, value: e.target.value })} disabled={form.type === 'free_shipping'} placeholder={form.type === 'free_shipping' ? 'N/A' : '0'} className="w-full px-4 py-2.5 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600 disabled:bg-gray-50 disabled:text-gray-400" />
                </div>
              </div>

              {/* Min purchase & Max discount */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Min Purchase (GH₵) <span className="text-gray-400 font-normal">(optional)</span></label>
                  <input type="number" min="0" step="0.01" value={form.minimum_purchase} onChange={e => setForm({ ...form, minimum_purchase: e.target.value })} placeholder="0" className="w-full px-4 py-2.5 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Max Discount (GH₵) <span className="text-gray-400 font-normal">(optional)</span></label>
                  <input type="number" min="0" step="0.01" value={form.maximum_discount} onChange={e => setForm({ ...form, maximum_discount: e.target.value })} placeholder="No cap" className="w-full px-4 py-2.5 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600" />
                </div>
              </div>

              {/* Usage limits */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Total Usage Limit <span className="text-gray-400 font-normal">(optional)</span></label>
                  <input type="number" min="0" value={form.usage_limit} onChange={e => setForm({ ...form, usage_limit: e.target.value })} placeholder="Unlimited" className="w-full px-4 py-2.5 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Per-Customer Limit</label>
                  <input type="number" min="1" value={form.per_user_limit} onChange={e => setForm({ ...form, per_user_limit: e.target.value })} placeholder="1" className="w-full px-4 py-2.5 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600" />
                </div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Start Date</label>
                  <input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} className="w-full px-4 py-2.5 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600 cursor-pointer" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">End Date <span className="text-gray-400 font-normal">(optional)</span></label>
                  <input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} className="w-full px-4 py-2.5 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600 cursor-pointer" />
                </div>
              </div>

              {/* Active toggle */}
              <div className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-gray-700">Active</p>
                  <p className="text-xs text-gray-500">Customers can use this coupon at checkout</p>
                </div>
                <button type="button" onClick={() => setForm({ ...form, is_active: !form.is_active })} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${form.is_active ? 'bg-green-600' : 'bg-gray-300'}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${form.is_active ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>

              {/* Preview */}
              {form.code && (
                <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg p-4 text-center">
                  <p className="text-xs text-gray-500 mb-1">Preview</p>
                  <p className="font-mono font-bold text-lg text-gray-900">{form.code}</p>
                  <p className="text-sm text-gray-700 mt-1">
                    {form.type === 'percentage' ? `${form.value || 0}% off` : form.type === 'fixed_amount' ? `GH₵ ${form.value || 0} off` : 'Free shipping'}
                    {Number(form.minimum_purchase) > 0 && ` on orders over GH₵ ${form.minimum_purchase}`}
                  </p>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-gray-200 flex items-center justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="px-5 py-2.5 border-2 border-gray-300 rounded-lg font-medium hover:bg-gray-50 cursor-pointer">Cancel</button>
              <button onClick={handleSave} disabled={saving || !form.code.trim()} className="px-6 py-2.5 bg-gray-900 text-white rounded-lg font-semibold hover:bg-gray-800 disabled:opacity-50 cursor-pointer">
                {saving ? <><i className="ri-loader-4-line animate-spin mr-2"></i>Saving...</> : editingId ? 'Update Coupon' : 'Create Coupon'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
