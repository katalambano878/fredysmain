'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type Staff = {
  id: string;
  full_name: string;
  phone: string | null;
  notes: string | null;
  is_active: boolean;
};

export default function ProductionStaffPage() {
  const [list, setList] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const { fetchWithTimeout } = await import('@/lib/fetch-timeout');
      const res = await fetchWithTimeout('/api/admin/production-staff?active=0', {
        credentials: 'include',
        timeoutMs: 15_000,
      });
      const json = await res.json();
      if (res.ok && Array.isArray(json.data)) setList(json.data);
    } catch (e) {
      console.error('[Production staff] load failed:', e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/production-staff', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: name.trim(), phone: phone.trim() || null, notes: notes.trim() || null }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed');
      setName('');
      setPhone('');
      setNotes('');
      await load();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(s: Staff) {
    const res = await fetch(`/api/admin/production-staff/${s.id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !s.is_active }),
    });
    if (res.ok) load();
    else alert((await res.json()).error || 'Update failed');
  }

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <Link href="/admin/finance" className="text-sm font-semibold text-brand-greenDark hover:underline">
          ← Finance
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">Production team</h1>
        <p className="text-gray-600 mt-1">
          Tailors and makers who appear on product COP and production logs. This is separate from admin login accounts.
        </p>
      </div>

      <form onSubmit={add} className="rounded-xl border border-gray-200 bg-white p-5 space-y-4 shadow-sm">
        <h2 className="font-bold text-gray-900">Add team member</h2>
        <div>
          <label className="block text-sm font-semibold text-gray-800 mb-1">Full name *</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            placeholder="e.g. Ama Mensah"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-800 mb-1">Phone</label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-800 mb-1">Notes</label>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 rounded-lg bg-brand-green text-white font-semibold text-sm disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Add'}
        </button>
      </form>

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
        <div className="px-5 py-3 border-b border-gray-100 font-bold text-gray-900">All members</div>
        {loading ? (
          <p className="p-5 text-gray-500">Loading…</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {list.map((s) => (
              <li key={s.id} className="px-5 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <p className="font-semibold text-gray-900">{s.full_name}</p>
                  <p className="text-sm text-gray-500">
                    {s.phone || '—'}
                    {s.notes ? ` · ${s.notes}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => toggleActive(s)}
                  className={`text-sm font-semibold px-3 py-1.5 rounded-lg border ${
                    s.is_active
                      ? 'border-gray-300 text-gray-700 hover:bg-gray-50'
                      : 'border-amber-300 text-amber-800 bg-amber-50'
                  }`}
                >
                  {s.is_active ? 'Deactivate' : 'Activate'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
