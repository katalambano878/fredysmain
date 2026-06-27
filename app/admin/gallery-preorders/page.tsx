'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';

type GalleryPreorder = {
  id: string;
  gallery_item_id: string;
  gallery_title: string | null;
  gallery_image_url: string | null;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  preferred_size: string | null;
  notes: string | null;
  status: 'pending' | 'contacted' | 'in_production' | 'completed' | 'cancelled';
  created_at: string;
  updated_at: string;
};

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending', color: 'bg-amber-100 text-amber-800', icon: 'ri-time-line' },
  { value: 'contacted', label: 'Contacted', color: 'bg-blue-100 text-blue-800', icon: 'ri-phone-line' },
  { value: 'in_production', label: 'In Production', color: 'bg-purple-100 text-purple-800', icon: 'ri-scissors-cut-line' },
  { value: 'completed', label: 'Completed', color: 'bg-green-100 text-green-800', icon: 'ri-check-double-line' },
  { value: 'cancelled', label: 'Cancelled', color: 'bg-red-100 text-red-800', icon: 'ri-close-circle-line' },
] as const;

function getStatusStyle(status: string) {
  return STATUS_OPTIONS.find((s) => s.value === status) || STATUS_OPTIONS[0];
}

export default function GalleryPreordersPage() {
  const [preorders, setPreorders] = useState<GalleryPreorder[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    fetchPreorders();
  }, []);

  const fetchPreorders = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/gallery-preorders', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setPreorders(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Failed to fetch gallery preorders:', err);
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (id: string, newStatus: string) => {
    setUpdatingId(id);
    try {
      const res = await fetch('/api/admin/gallery-preorders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id, status: newStatus }),
      });
      if (res.ok) {
        setPreorders((prev) =>
          prev.map((p) => (p.id === id ? { ...p, status: newStatus as GalleryPreorder['status'], updated_at: new Date().toISOString() } : p)),
        );
      }
    } catch (err) {
      console.error('Failed to update status:', err);
    } finally {
      setUpdatingId(null);
    }
  };

  const filtered = statusFilter === 'all' ? preorders : preorders.filter((p) => p.status === statusFilter);

  const counts = {
    all: preorders.length,
    pending: preorders.filter((p) => p.status === 'pending').length,
    contacted: preorders.filter((p) => p.status === 'contacted').length,
    in_production: preorders.filter((p) => p.status === 'in_production').length,
    completed: preorders.filter((p) => p.status === 'completed').length,
    cancelled: preorders.filter((p) => p.status === 'cancelled').length,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Gallery Preorders</h1>
        <p className="text-gray-600 mt-1">Customer requests to produce designs from the gallery</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          { key: 'all', label: 'All' },
          ...STATUS_OPTIONS.map((s) => ({ key: s.value, label: s.label })),
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setStatusFilter(tab.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              statusFilter === tab.key
                ? 'bg-gray-900 text-white'
                : 'bg-white border border-gray-300 text-gray-700 hover:border-gray-400'
            }`}
          >
            {tab.label}
            <span className="ml-1.5 text-xs opacity-75">({counts[tab.key as keyof typeof counts] ?? 0})</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="p-12 text-center text-gray-500">
          <i className="ri-loader-4-line animate-spin text-3xl mb-2 inline-block" />
          <p>Loading preorders...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <i className="ri-inbox-line text-4xl text-gray-300 mb-4 block" />
          <p className="text-lg font-semibold text-gray-700">No gallery preorders yet</p>
          <p className="text-sm text-gray-400 mt-1">When customers request designs from the gallery, they'll appear here.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((order) => {
            const style = getStatusStyle(order.status);
            return (
              <div key={order.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                {order.gallery_image_url && (
                  <div className="relative h-48 bg-gray-100">
                    <Image
                      src={order.gallery_image_url}
                      alt={order.gallery_title || 'Gallery design'}
                      fill
                      className="object-cover"
                      sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
                    />
                    <div className="absolute top-3 left-3">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${style.color}`}>
                        <i className={style.icon} /> {style.label}
                      </span>
                    </div>
                  </div>
                )}
                <div className="p-4 space-y-3">
                  <div>
                    <p className="font-bold text-gray-900">{order.gallery_title || 'Untitled design'}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(order.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>

                  <div className="space-y-1.5 text-sm">
                    <p className="flex items-center gap-2 text-gray-800">
                      <i className="ri-user-line text-gray-400 w-4" /> {order.customer_name}
                    </p>
                    <p className="flex items-center gap-2 text-gray-800">
                      <i className="ri-phone-line text-gray-400 w-4" />
                      <a href={`tel:${order.customer_phone}`} className="text-brand-greenDark hover:underline">{order.customer_phone}</a>
                    </p>
                    {order.customer_email && (
                      <p className="flex items-center gap-2 text-gray-800">
                        <i className="ri-mail-line text-gray-400 w-4" />
                        <a href={`mailto:${order.customer_email}`} className="text-brand-greenDark hover:underline truncate">{order.customer_email}</a>
                      </p>
                    )}
                    {order.preferred_size && (
                      <p className="flex items-center gap-2 text-gray-800">
                        <i className="ri-ruler-line text-gray-400 w-4" /> {order.preferred_size}
                      </p>
                    )}
                    {order.notes && (
                      <div className="mt-2 bg-gray-50 rounded-lg p-2.5 text-xs text-gray-600 border border-gray-100">
                        <p className="font-medium text-gray-700 mb-0.5">Customer notes:</p>
                        {order.notes}
                      </div>
                    )}
                  </div>

                  <div className="pt-2 border-t border-gray-100">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Update status</label>
                    <select
                      value={order.status}
                      onChange={(e) => updateStatus(order.id, e.target.value)}
                      disabled={updatingId === order.id}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium cursor-pointer disabled:opacity-50 focus:ring-2 focus:ring-gray-600 focus:border-gray-600"
                    >
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
