'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export default function ConversationsPage() {
  const [conversations, setConversations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sentimentFilter, setSentimentFilter] = useState('');
  const [resolvedFilter, setResolvedFilter] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce search input (400ms)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search]);

  const fetchConversations = useCallback(async () => {
    setLoading(true);
    try {
      const offset = (page - 1) * limit;

      // Use RPC for deep message search (searches inside actual chat messages)
      const { data: result, error } = await supabase.rpc('search_chat_conversations', {
        p_search: debouncedSearch || '',
        p_sentiment: sentimentFilter || '',
        p_resolved: resolvedFilter || '',
        p_limit: limit,
        p_offset: offset,
      });

      if (error) {
        console.error('Search error:', error);
        setConversations([]);
        setTotal(0);
      } else {
        const parsed = typeof result === 'string' ? JSON.parse(result) : result;
        setConversations(parsed?.data || []);
        setTotal(parsed?.total || 0);
      }
    } catch (e) {
      console.error('Search error:', e);
      setConversations([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, sentimentFilter, resolvedFilter]);

  useEffect(() => { fetchConversations(); }, [fetchConversations]);

  // Extract a snippet from messages that matches the search term
  const findMatchSnippet = (messages: any, term: string): string | null => {
    if (!term || !messages) return null;
    let msgs = messages;
    if (typeof msgs === 'string') {
      try { msgs = JSON.parse(msgs); } catch { return null; }
    }
    if (!Array.isArray(msgs)) return null;
    const lower = term.toLowerCase();
    for (const msg of msgs) {
      const content = msg?.content || '';
      const idx = content.toLowerCase().indexOf(lower);
      if (idx !== -1) {
        const start = Math.max(0, idx - 30);
        const end = Math.min(content.length, idx + term.length + 30);
        const prefix = start > 0 ? '...' : '';
        const suffix = end < content.length ? '...' : '';
        return `${prefix}${content.slice(start, end)}${suffix}`;
      }
    }
    return null;
  };

  const sentimentIcon = (s: string) => {
    if (s === 'positive') return <span className="text-gray-600"><i className="ri-emotion-happy-line text-lg" /></span>;
    if (s === 'negative') return <span className="text-red-500"><i className="ri-emotion-unhappy-line text-lg" /></span>;
    return <span className="text-gray-400"><i className="ri-emotion-normal-line text-lg" /></span>;
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
            <Link href="/admin/support" className="hover:text-gray-700">Support</Link>
            <i className="ri-arrow-right-s-line text-xs" />
            <span className="text-gray-900 font-medium">Conversations</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">AI Chat History</h1>
          <p className="text-sm text-gray-500 mt-1">{total} total conversations</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text" placeholder="Search anything said in conversations..."
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-600 focus:border-gray-600"
              value={search} onChange={(e) => setSearch(e.target.value)}
            />
            {debouncedSearch && (
              <button onClick={() => { setSearch(''); setDebouncedSearch(''); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <i className="ri-close-circle-fill" />
              </button>
            )}
          </div>
          <select value={sentimentFilter} onChange={(e) => { setSentimentFilter(e.target.value); setPage(1); }}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-600">
            <option value="">All Sentiments</option>
            <option value="positive">Positive</option>
            <option value="neutral">Neutral</option>
            <option value="negative">Negative</option>
          </select>
          <select value={resolvedFilter} onChange={(e) => { setResolvedFilter(e.target.value); setPage(1); }}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-600">
            <option value="">All Status</option>
            <option value="true">Resolved</option>
            <option value="false">Unresolved</option>
            <option value="escalated">Escalated</option>
          </select>
          {debouncedSearch && (
            <span className="text-xs text-gray-700 bg-gray-50 px-2 py-1 rounded-lg flex items-center gap-1">
              <i className="ri-search-eye-line" /> Deep searching messages
            </span>
          )}
        </div>
      </div>

      {/* Conversations List */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400"><i className="ri-loader-4-line animate-spin text-2xl" /></div>
        ) : conversations.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <i className="ri-chat-off-line text-5xl mb-3 block" />
            <p className="text-sm font-medium">No conversations found</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {/* Header */}
            <div className="hidden md:grid grid-cols-12 gap-4 px-4 py-3 bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide">
              <div className="col-span-1">Mood</div>
              <div className="col-span-3">Customer</div>
              <div className="col-span-3">Summary</div>
              <div className="col-span-1 text-center">Msgs</div>
              <div className="col-span-1">Category</div>
              <div className="col-span-1">Status</div>
              <div className="col-span-2 text-right">Date</div>
            </div>
            {conversations.map((conv) => (
              <Link key={conv.id} href={`/admin/support/conversations/${conv.id}`}
                className="grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-4 px-4 py-3 hover:bg-gray-50 transition-colors items-center">
                <div className="col-span-1 flex md:justify-start">{sentimentIcon(conv.sentiment || 'neutral')}</div>
                <div className="col-span-3">
                  <p className="text-sm font-medium text-gray-900 truncate">{conv.customer_name || conv.customer_email || 'Anonymous'}</p>
                  <p className="text-xs text-gray-400 truncate">{conv.customer_email || conv.session_id?.slice(0, 20)}</p>
                </div>
                <div className="col-span-3">
                  <p className="text-xs text-gray-600 truncate">{conv.summary || 'No summary'}</p>
                  {debouncedSearch && (() => {
                    const snippet = findMatchSnippet(conv.messages, debouncedSearch);
                    if (!snippet) return null;
                    return (
                      <p className="text-[10px] text-gray-700 bg-gray-50 px-1.5 py-0.5 rounded mt-1 truncate">
                        <i className="ri-chat-quote-line mr-1" />{snippet}
                      </p>
                    );
                  })()}
                </div>
                <div className="col-span-1 text-center">
                  <span className="text-xs font-semibold text-gray-700 bg-gray-100 px-2 py-0.5 rounded-full">{conv.message_count || 0}</span>
                </div>
                <div className="col-span-1">
                  {conv.category && <span className="text-[10px] font-semibold uppercase bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">{conv.category}</span>}
                </div>
                <div className="col-span-1 flex gap-1 flex-wrap">
                  {conv.is_escalated && <span className="text-[9px] font-bold bg-red-100 text-red-600 px-1.5 py-0.5 rounded">ESC</span>}
                  {conv.is_resolved ? (
                    <span className="text-[9px] font-bold bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded">OK</span>
                  ) : (
                    <span className="text-[9px] font-bold bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded">OPEN</span>
                  )}
                </div>
                <div className="col-span-2 text-right">
                  <p className="text-xs text-gray-500">{new Date(conv.updated_at).toLocaleDateString()}</p>
                  <p className="text-[10px] text-gray-400">{new Date(conv.updated_at).toLocaleTimeString()}</p>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <p className="text-xs text-gray-500">Page {page} of {totalPages} ({total} total)</p>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40">Previous</button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40">Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
