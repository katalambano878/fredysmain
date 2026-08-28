'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

type GalleryRow = {
  id: string;
  title: string;
  caption: string | null;
  image_url: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
};

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (session?.access_token) h.Authorization = `Bearer ${session.access_token}`;
  return h;
}

export default function HomepageGalleryAdminPage() {
  const [items, setItems] = useState<GalleryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [title, setTitle] = useState('');
  const [caption, setCaption] = useState('');
  const [imageUrl, setImageUrl] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const headers = await authHeaders();
      const res = await fetch('/api/admin/homepage-gallery', { credentials: 'include', headers });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load');
      setItems(json.items || []);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', e.target.files[0]);
      formData.append('bucket', 'cms-images');
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/admin/upload', {
        method: 'POST',
        credentials: 'include',
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
        body: formData,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Upload failed');
      setImageUrl(json.url);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleAdd = async () => {
    if (!imageUrl.trim()) {
      alert('Please upload an image first.');
      return;
    }
    setSaving(true);
    try {
      const headers = await authHeaders();
      const res = await fetch('/api/admin/homepage-gallery', {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({ title, caption, image_url: imageUrl, is_active: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to save');
      setTitle('');
      setCaption('');
      setImageUrl('');
      await load();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  };

  const patch = async (id: string, body: Record<string, unknown>) => {
    const headers = await authHeaders();
    const res = await fetch(`/api/admin/homepage-gallery/${id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers,
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Update failed');
    return json.item as GalleryRow;
  };

  const move = async (rowId: string, dir: -1 | 1) => {
    // Display order: highest sort_order first (newest on top)
    const sorted = [...items].sort((a, b) => {
      if (b.sort_order !== a.sort_order) return b.sort_order - a.sort_order;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    const i = sorted.findIndex((x) => x.id === rowId);
    if (i < 0) return;
    const j = i + dir;
    if (j < 0 || j >= sorted.length) return;
    const a = sorted[i];
    const b = sorted[j];
    setSaving(true);
    try {
      const ao = a.sort_order;
      const bo = b.sort_order;
      await Promise.all([
        patch(a.id, { sort_order: bo }),
        patch(b.id, { sort_order: ao }),
      ]);
      await load();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (row: GalleryRow) => {
    try {
      await patch(row.id, { is_active: !row.is_active });
      await load();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Remove this image from the homepage gallery?')) return;
    setSaving(true);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/admin/homepage-gallery/${id}`, {
        method: 'DELETE',
        credentials: 'include',
        headers,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Delete failed');
      await load();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  };

  const sorted = [...items].sort((a, b) => {
    if (b.sort_order !== a.sort_order) return b.sort_order - a.sort_order;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Homepage dress gallery</h1>
        <p className="mt-2 text-gray-600 text-sm">
          Upload photos of dresses and outfits to showcase on the store homepage. Only active items appear to customers.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Add new photo</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Image</label>
            <input type="file" accept="image/*" onChange={handleFile} disabled={uploading || saving} className="text-sm" />
            {uploading && <p className="text-xs text-gray-500 mt-1">Uploading…</p>}
            {imageUrl && (
              <div className="mt-3 relative w-40 h-52 rounded-lg overflow-hidden border border-gray-200">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imageUrl} alt="Preview" className="w-full h-full object-cover" />
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title (optional)</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="e.g. Birthday Ankara set"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Caption (optional)</label>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="Short note for customers"
            />
          </div>
          <button
            type="button"
            onClick={handleAdd}
            disabled={saving || !imageUrl}
            className="inline-flex items-center px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Add to gallery'}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Current gallery ({sorted.length})</h2>
        {loading ? (
          <p className="text-gray-500 text-sm">Loading…</p>
        ) : sorted.length === 0 ? (
          <p className="text-gray-500 text-sm">No images yet. Add your first photo above.</p>
        ) : (
          <ul className="space-y-4">
            {sorted.map((row, index) => (
              <li
                key={row.id}
                className="flex flex-col sm:flex-row gap-4 p-4 border border-gray-100 rounded-lg bg-gray-50/80"
              >
                <div className="relative w-full sm:w-32 h-40 sm:h-28 flex-shrink-0 rounded-lg overflow-hidden border border-gray-200 bg-white">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={row.image_url} alt="" className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900">{row.title || 'Untitled'}</p>
                  {row.caption && <p className="text-sm text-gray-600 mt-1">{row.caption}</p>}
                  <p className="text-xs text-gray-400 mt-2">Order: {row.sort_order} · {row.is_active ? 'Active' : 'Hidden'}</p>
                </div>
                <div className="flex flex-wrap gap-2 items-start sm:flex-col sm:items-end">
                  <button
                    type="button"
                    onClick={() => move(row.id, -1)}
                    disabled={saving || index === 0}
                    className="px-2 py-1 text-xs border rounded-lg disabled:opacity-40"
                  >
                    Up
                  </button>
                  <button
                    type="button"
                    onClick={() => move(row.id, 1)}
                    disabled={saving || index === sorted.length - 1}
                    className="px-2 py-1 text-xs border rounded-lg disabled:opacity-40"
                  >
                    Down
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleActive(row)}
                    className="px-2 py-1 text-xs border rounded-lg"
                  >
                    {row.is_active ? 'Hide' : 'Show'}
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(row.id)}
                    disabled={saving}
                    className="px-2 py-1 text-xs border border-red-200 text-red-700 rounded-lg"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
