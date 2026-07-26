'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Address = {
  id: string;
  full_name: string;
  phone: string;
  address_line1: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  is_default: boolean;
};

type FormState = {
  full_name: string;
  phone: string;
  address_line1: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  is_default: boolean;
};

const emptyForm: FormState = {
  full_name: '',
  phone: '',
  address_line1: '',
  city: '',
  state: '',
  postal_code: '',
  country: 'Ghana',
  is_default: false,
};

async function addressesRequest<T>(
  path: string,
  init?: RequestInit & { json?: unknown }
): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not signed in');

  const headers: Record<string, string> = {
    Authorization: `Bearer ${session.access_token}`,
    ...(init?.json !== undefined ? { 'Content-Type': 'application/json' } : {}),
  };

  const res = await fetch(path, {
    ...init,
    headers: { ...headers, ...(init?.headers as Record<string, string>) },
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || res.statusText || 'Request failed');
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export default function AddressBook() {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await addressesRequest<Address[]>('/api/addresses');
      setAddresses(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Address load failed', err);
      setError('Could not load addresses. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm, is_default: addresses.length === 0 });
    setShowForm(true);
    setError('');
  };

  const openEdit = (addr: Address) => {
    setEditingId(addr.id);
    setForm({
      full_name: addr.full_name,
      phone: addr.phone,
      address_line1: addr.address_line1,
      city: addr.city,
      state: addr.state,
      postal_code: addr.postal_code === '-' ? '' : addr.postal_code,
      country: addr.country || 'Ghana',
      is_default: addr.is_default,
    });
    setShowForm(true);
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...form,
        postal_code: form.postal_code.trim() || '-',
      };
      if (editingId) {
        await addressesRequest(`/api/addresses/${editingId}`, { method: 'PATCH', json: payload });
      } else {
        await addressesRequest('/api/addresses', { method: 'POST', json: payload });
      }
      setShowForm(false);
      setEditingId(null);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save address');
    } finally {
      setSaving(false);
    }
  };

  const deleteAddress = async (id: string) => {
    if (!confirm('Delete this address?')) return;
    try {
      await addressesRequest(`/api/addresses/${id}`, { method: 'DELETE' });
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  const setDefault = async (id: string) => {
    try {
      await addressesRequest(`/api/addresses/${id}`, { method: 'PATCH', json: { set_default: true } });
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to set default');
    }
  };

  if (loading) {
    return (
      <div className="py-8 text-center">
        <i className="ri-loader-4-line animate-spin text-3xl text-gray-900"></i>
        <p className="mt-2 text-gray-500">Loading addresses...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Address Book</h2>
        <button
          type="button"
          onClick={openCreate}
          className="px-4 py-2 bg-gray-900 text-white rounded-lg font-semibold hover:bg-gray-800 transition-colors whitespace-nowrap"
        >
          <i className="ri-add-line mr-2"></i>
          Add New Address
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {showForm && (
        <div className="bg-white border-2 border-gray-900 rounded-lg p-6 mb-6">
          <h3 className="text-xl font-bold text-gray-900 mb-4">
            {editingId ? 'Edit Address' : 'New Address'}
          </h3>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">Full Name</label>
              <input
                required
                type="text"
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                placeholder="John Doe"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">Phone Number</label>
              <input
                required
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                placeholder="024 472 0197"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-gray-900 mb-2">Street Address</label>
              <input
                required
                type="text"
                value={form.address_line1}
                onChange={(e) => setForm({ ...form, address_line1: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                placeholder="123 Oxford Street"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">City</label>
              <input
                required
                type="text"
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                placeholder="Accra"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">State / Region</label>
              <input
                required
                type="text"
                value={form.state}
                onChange={(e) => setForm({ ...form, state: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                placeholder="Greater Accra"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">Zip Code</label>
              <input
                type="text"
                value={form.postal_code}
                onChange={(e) => setForm({ ...form, postal_code: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                placeholder="00233"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">Country</label>
              <input
                type="text"
                value={form.country}
                onChange={(e) => setForm({ ...form, country: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                placeholder="Ghana"
              />
            </div>
            <div className="md:col-span-2">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={form.is_default}
                  onChange={(e) => setForm({ ...form, is_default: e.target.checked })}
                  className="w-4 h-4 text-gray-900 border-gray-300 rounded focus:ring-gray-900"
                />
                <span className="ml-2 text-sm text-gray-700">Set as default address</span>
              </label>
            </div>
            <div className="md:col-span-2 flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-3">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 py-3 bg-gray-900 text-white rounded-lg font-semibold hover:bg-gray-800 transition-colors whitespace-nowrap disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save Address'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditingId(null);
                }}
                className="flex-1 py-3 border-2 border-gray-300 text-gray-900 rounded-lg font-semibold hover:bg-gray-50 transition-colors whitespace-nowrap"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {addresses.length === 0 && !showForm ? (
        <div className="py-12 text-center bg-white rounded-lg border border-gray-200">
          <i className="ri-map-pin-line text-4xl text-gray-300 mb-3 block" />
          <h3 className="text-lg font-semibold text-gray-900 mb-1">No saved addresses</h3>
          <p className="text-gray-500 mb-4">Add one to speed up checkout.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {addresses.map((address) => (
            <div
              key={address.id}
              className={`bg-white border-2 rounded-lg p-6 relative ${address.is_default ? 'border-gray-900' : 'border-gray-200'
                }`}
            >
              {address.is_default && (
                <div className="absolute top-4 right-4">
                  <span className="px-3 py-1 bg-gray-900 text-white text-xs font-semibold rounded-full whitespace-nowrap">
                    Default
                  </span>
                </div>
              )}

              <div className="mb-4 pr-16">
                <h3 className="text-lg font-bold text-gray-900">{address.full_name}</h3>
                <p className="text-gray-600">{address.phone}</p>
              </div>

              <div className="text-gray-700 space-y-1 mb-6">
                <p>{address.address_line1}</p>
                <p>{address.city}, {address.state} {address.postal_code !== '-' ? address.postal_code : ''}</p>
                <p>{address.country}</p>
              </div>

              <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2">
                <button
                  type="button"
                  onClick={() => openEdit(address)}
                  className="flex-1 py-2 border border-gray-300 text-gray-900 rounded-lg font-semibold hover:bg-gray-50 transition-colors whitespace-nowrap"
                >
                  Edit
                </button>
                {!address.is_default && (
                  <button
                    type="button"
                    onClick={() => setDefault(address.id)}
                    className="flex-1 py-2 border border-gray-900 text-gray-900 rounded-lg font-semibold hover:bg-gray-50 transition-colors whitespace-nowrap"
                  >
                    Set Default
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => deleteAddress(address.id)}
                  className="px-4 py-2 border border-red-600 text-red-600 rounded-lg font-semibold hover:bg-red-50 transition-colors whitespace-nowrap"
                >
                  <i className="ri-delete-bin-line"></i>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
