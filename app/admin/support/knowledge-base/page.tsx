'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

export default function KnowledgeBasePage() {
  const searchParams = useSearchParams();
  const [articles, setArticles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [showModal, setShowModal] = useState(searchParams.get('new') === '1');
  const [editingArticle, setEditingArticle] = useState<any>(null);

  const fetchArticles = useCallback(async (searchTerm: string, category: string) => {
    setLoading(true);
    try {
      const { fetchWithTimeout } = await import('@/lib/fetch-timeout');
      const params = new URLSearchParams();
      if (searchTerm) params.set('search', searchTerm);
      if (category) params.set('category', category);
      const res = await fetchWithTimeout(`/api/support/knowledge-base?${params}`, { timeoutMs: 15_000 });
      const data = await res.json();
      setArticles(data.data || []);
    } catch (e) {
      console.error('[Knowledge base]', e);
      setArticles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounce search to avoid spinner on every keystroke
  useEffect(() => {
    const t = setTimeout(() => {
      fetchArticles(search, categoryFilter);
    }, search ? 350 : 0);
    return () => clearTimeout(t);
  }, [search, categoryFilter, fetchArticles]);

  async function deleteArticle(id: string) {
    if (!confirm('Delete this article?')) return;
    await fetch(`/api/support/knowledge-base?id=${id}`, { method: 'DELETE' });
    fetchArticles(search, categoryFilter);
  }

  async function togglePublish(article: any) {
    await fetch('/api/support/knowledge-base', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: article.id, is_published: !article.is_published }),
    });
    fetchArticles(search, categoryFilter);
  }

  const categories = [...new Set(articles.map(a => a.category).filter(Boolean))];
  const sourceColors: Record<string, string> = { manual: 'bg-blue-100 text-blue-700', auto_learned: 'bg-purple-100 text-purple-700', ticket_resolution: 'bg-gray-100 text-gray-900' };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
            <Link href="/admin/support" className="hover:text-gray-700">Support</Link>
            <i className="ri-arrow-right-s-line text-xs" />
            <span className="text-gray-900 font-medium">Knowledge Base</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Knowledge Base</h1>
          <p className="text-sm text-gray-500 mt-1">{articles.length} articles &middot; AI learns from these to answer customer questions</p>
        </div>
        <button onClick={() => { setEditingArticle(null); setShowModal(true); }}
          className="inline-flex items-center gap-2 px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-900 text-sm font-medium transition-colors">
          <i className="ri-add-line" /> New Article
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Search articles..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-600" />
        </div>
        {categories.length > 0 && (
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}
            className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-600">
            <option value="">All Categories</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
      </div>

      {/* Articles Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <div key={i} className="bg-white rounded-xl h-48 animate-pulse" />)}
        </div>
      ) : articles.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <i className="ri-book-open-line text-5xl mb-3 block text-gray-300" />
          <p className="text-sm font-medium text-gray-500">No articles yet</p>
          <p className="text-xs text-gray-400 mt-1">Create knowledge base articles for the AI to learn from</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {articles.map((article) => (
            <div key={article.id} className="bg-white rounded-xl border border-gray-100 p-4 hover:shadow-md transition-all group">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  {article.category && <span className="text-[10px] font-semibold uppercase bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{article.category}</span>}
                  <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${sourceColors[article.source] || 'bg-gray-100 text-gray-600'}`}>{article.source?.replace(/_/g, ' ')}</span>
                </div>
                <div className={`w-2 h-2 rounded-full ${article.is_published ? 'bg-gray-600' : 'bg-gray-300'}`} title={article.is_published ? 'Published' : 'Draft'} />
              </div>
              <h3 className="text-sm font-semibold text-gray-900 mb-1 line-clamp-2">{article.title}</h3>
              <p className="text-xs text-gray-500 line-clamp-3 mb-3">{article.content}</p>
              <div className="flex items-center justify-between pt-2 border-t border-gray-50">
                <div className="flex items-center gap-3 text-[10px] text-gray-400">
                  <span><i className="ri-thumb-up-line mr-0.5" />{article.helpful_count}</span>
                  <span><i className="ri-thumb-down-line mr-0.5" />{article.not_helpful_count}</span>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => { setEditingArticle(article); setShowModal(true); }}
                    className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500"><i className="ri-pencil-line text-sm" /></button>
                  <button onClick={() => togglePublish(article)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500">
                    <i className={`${article.is_published ? 'ri-eye-off-line' : 'ri-eye-line'} text-sm`} />
                  </button>
                  <button onClick={() => deleteArticle(article.id)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-50 text-red-400"><i className="ri-delete-bin-6-line text-sm" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Article Modal */}
      {showModal && (
        <ArticleModal
          article={editingArticle}
          onClose={() => setShowModal(false)}
          onSaved={() => fetchArticles(search, categoryFilter)}
        />
      )}
    </div>
  );
}

function ArticleModal({ article, onClose, onSaved }: { article: any; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    title: article?.title || '',
    content: article?.content || '',
    category: article?.category || '',
    tags: article?.tags?.join(', ') || '',
    is_published: article?.is_published ?? true,
  });
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title || !form.content) return;
    setSaving(true);
    const payload = {
      ...form,
      tags: form.tags.split(',').map((t: string) => t.trim()).filter(Boolean),
      ...(article ? { id: article.id } : {}),
    };
    await fetch('/api/support/knowledge-base', {
      method: article ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    onSaved();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <h2 className="text-lg font-bold text-gray-900">{article ? 'Edit Article' : 'New KB Article'}</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100"><i className="ri-close-line text-lg" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Title *</label>
            <input required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-600" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Content *</label>
            <textarea required value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} rows={8}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-600 font-mono" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Category</label>
              <input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} placeholder="e.g., shipping, returns"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-600" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Tags (comma-separated)</label>
              <input value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })} placeholder="shipping, delivery, policy"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-600" />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={form.is_published} onChange={e => setForm({ ...form, is_published: e.target.checked })}
              className="rounded border-gray-300 text-gray-700 focus:ring-gray-600" />
            Published (AI can use this for answers)
          </label>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 text-sm bg-gray-700 text-white rounded-lg hover:bg-gray-900 disabled:opacity-50">
              {saving ? 'Saving...' : article ? 'Update' : 'Create Article'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
