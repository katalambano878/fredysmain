'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { slugifyProduct } from '@/lib/product-seo';

export default function AdminBlogNewPage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [content, setContent] = useState('');
  const [status, setStatus] = useState<'draft' | 'published'>('draft');
  const [featuredImage, setFeaturedImage] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleTitle = (v: string) => {
    setTitle(v);
    if (!slug.trim()) setSlug(slugifyProduct(v));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        title: title.trim(),
        slug: slug.trim() || slugifyProduct(title),
        content: content.trim() || '<p></p>',
        excerpt: content.replace(/<[^>]*>/g, ' ').trim().slice(0, 200),
        featured_image: featuredImage.trim() || null,
        status,
        published_at: status === 'published' ? new Date().toISOString() : null,
      };
      const { data, error: insertError } = await supabase.from('blog_posts').insert(payload).select('id').single();
      if (insertError) throw insertError;
      router.push(`/admin/blog/${data.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save post');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">New Blog Post</h1>
        <Link href="/admin/blog" className="text-sm font-semibold text-gray-600 hover:text-gray-900">
          Back to list
        </Link>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-2">Title</label>
          <input
            required
            value={title}
            onChange={(e) => handleTitle(e.target.value)}
            className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-2">Slug</label>
          <input
            required
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-2">Featured image URL</label>
          <input
            value={featuredImage}
            onChange={(e) => setFeaturedImage(e.target.value)}
            className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg"
            placeholder="https://..."
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-2">Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as 'draft' | 'published')}
            className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg bg-white"
          >
            <option value="draft">Draft</option>
            <option value="published">Published</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-2">Content (HTML)</label>
          <textarea
            required
            rows={12}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg font-mono text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="w-full bg-gray-900 text-white py-3 rounded-lg font-semibold disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Create post'}
        </button>
      </form>
    </div>
  );
}
