'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function AdminBlogEditPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params?.id || '');

  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [content, setContent] = useState('');
  const [status, setStatus] = useState<'draft' | 'published'>('draft');
  const [featuredImage, setFeaturedImage] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      const { data, error: qError } = await supabase
        .from('blog_posts')
        .select('*')
        .eq('id', id)
        .single();
      if (qError || !data) {
        setError('Post not found');
        setLoading(false);
        return;
      }
      setTitle(data.title || '');
      setSlug(data.slug || '');
      setContent(data.content || '');
      setStatus(data.status === 'published' ? 'published' : 'draft');
      setFeaturedImage(data.featured_image || '');
      setLoading(false);
    }
    if (id) load();
  }, [id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        title: title.trim(),
        slug: slug.trim(),
        content: content.trim(),
        excerpt: content.replace(/<[^>]*>/g, ' ').trim().slice(0, 200),
        featured_image: featuredImage.trim() || null,
        status,
        published_at: status === 'published' ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      };
      const { error: updateError } = await supabase.from('blog_posts').update(payload).eq('id', id);
      if (updateError) throw updateError;
      router.push('/admin/blog');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update post');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="py-12 text-center">
        <i className="ri-loader-4-line animate-spin text-3xl text-gray-900" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Edit Blog Post</h1>
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
            onChange={(e) => setTitle(e.target.value)}
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
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </form>
    </div>
  );
}
