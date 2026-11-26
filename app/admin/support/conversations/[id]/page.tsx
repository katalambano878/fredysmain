'use client';

import { useState, useEffect, useCallback, use } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import MarkdownMessage from '@/components/MarkdownMessage';

export default function ConversationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [conversation, setConversation] = useState<any>(null);
  const [memories, setMemories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newMemory, setNewMemory] = useState('');
  const [memoryType, setMemoryType] = useState('context');
  const [addingMemory, setAddingMemory] = useState(false);
  const [creatingTicket, setCreatingTicket] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data: conv } = await supabase.from('chat_conversations').select('*').eq('id', id).single();
    setConversation(conv);

    if (conv?.user_id) {
      const { data: memData } = await supabase.from('ai_memory').select('*').eq('customer_id', conv.user_id).order('created_at', { ascending: false });
      setMemories(memData || []);
    } else if (conv?.customer_email) {
      const { data: memData } = await supabase.from('ai_memory').select('*').eq('customer_email', conv.customer_email).order('created_at', { ascending: false });
      setMemories(memData || []);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function addMemoryNote() {
    if (!newMemory.trim()) return;
    setAddingMemory(true);
    const { error: memoryError } = await supabase.from('ai_memory').insert({
      customer_id: conversation?.user_id || null,
      customer_email: conversation?.customer_email || null,
      memory_type: memoryType,
      content: newMemory.trim(),
      importance: 'normal',
      source_conversation_id: id,
    });
    setAddingMemory(false);
    if (memoryError) {
      alert('The note was not saved. Try again.');
      return;
    }
    setNewMemory('');
    await fetchData();
  }

  async function deleteMemory(memId: string) {
    const { error: deleteError } = await supabase.from('ai_memory').delete().eq('id', memId);
    if (deleteError) {
      alert('The note was not deleted. Try again.');
      return;
    }
    setMemories(prev => prev.filter(m => m.id !== memId));
  }

  async function toggleResolved() {
    const newVal = !conversation.is_resolved;
    const { error: resolveError } = await supabase.from('chat_conversations').update({ is_resolved: newVal }).eq('id', id);
    if (resolveError) {
      alert('That change was not saved. Try again.');
      return;
    }
    setConversation({ ...conversation, is_resolved: newVal });
  }

  async function createTicketFromConversation() {
    setCreatingTicket(true);
    const res = await fetch('/api/support/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject: conversation.summary || `Chat conversation from ${conversation.customer_name || conversation.customer_email || 'customer'}`,
        description: `Auto-created from AI conversation. Session: ${conversation.session_id}`,
        customer_id: conversation.user_id,
        customer_email: conversation.customer_email,
        customer_name: conversation.customer_name,
        conversation_id: conversation.id,
        category: conversation.category,
        channel: 'chat',
        priority: conversation.sentiment === 'negative' ? 'high' : 'medium',
        initial_message: conversation.summary || 'Created from AI chat conversation',
      }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setCreatingTicket(false);
    if (!res || !res.ok) {
      alert(data?.error || 'The ticket was not created. Try again.');
      return;
    }
    if (data.data) {
      await supabase.from('chat_conversations').update({ is_escalated: true, escalated_at: new Date().toISOString() }).eq('id', id);
      setConversation({ ...conversation, is_escalated: true });
      alert(`Ticket ${data.data.ticket_number} created!`);
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64"><i className="ri-loader-4-line animate-spin text-3xl text-gray-400" /></div>;
  }

  if (!conversation) {
    return <div className="text-center p-12"><p className="text-gray-500">Conversation not found</p></div>;
  }

  let parsedMessages = conversation.messages;
  if (typeof parsedMessages === 'string') {
    try { parsedMessages = JSON.parse(parsedMessages); } catch { parsedMessages = []; }
  }
  if (!Array.isArray(parsedMessages)) parsedMessages = [];
  const messages: any[] = parsedMessages;

  let meta = conversation.metadata || {};
  if (typeof meta === 'string') {
    try { meta = JSON.parse(meta); } catch { meta = {}; }
  }

  const sentimentColor = conversation.sentiment === 'positive' ? 'text-gray-700 bg-gray-50' : conversation.sentiment === 'negative' ? 'text-red-600 bg-red-50' : 'text-gray-600 bg-gray-50';
  const memoryTypeColors: Record<string, string> = { preference: 'bg-purple-100 text-purple-700', issue: 'bg-red-100 text-red-700', context: 'bg-blue-100 text-blue-700', instruction: 'bg-amber-100 text-amber-700', fact: 'bg-gray-100 text-gray-900' };

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/admin/support" className="hover:text-gray-700">Support</Link>
        <i className="ri-arrow-right-s-line text-xs" />
        <Link href="/admin/support/conversations" className="hover:text-gray-700">Conversations</Link>
        <i className="ri-arrow-right-s-line text-xs" />
        <span className="text-gray-900 font-medium truncate">{conversation.session_id?.slice(0, 16)}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chat Transcript - 2/3 */}
        <div className="lg:col-span-2 space-y-4">
          {/* Header bar */}
          <div className="bg-white rounded-xl border border-gray-100 p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-bold text-gray-900">{conversation.customer_name || conversation.customer_email || 'Anonymous Chat'}</h1>
              <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-full ${sentimentColor}`}>
                {conversation.sentiment || 'neutral'}
              </span>
            </div>
            <div className="flex gap-2">
              <button onClick={toggleResolved}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${conversation.is_resolved ? 'bg-gray-50 border-gray-200 text-gray-900' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'}`}>
                <i className={`${conversation.is_resolved ? 'ri-checkbox-circle-fill' : 'ri-checkbox-blank-circle-line'} mr-1`} />
                {conversation.is_resolved ? 'Resolved' : 'Mark Resolved'}
              </button>
              <button onClick={createTicketFromConversation} disabled={creatingTicket || conversation.is_escalated}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40 transition-colors">
                <i className="ri-ticket-line mr-1" />
                {conversation.is_escalated ? 'Ticket Created' : creatingTicket ? 'Creating...' : 'Create Ticket'}
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="bg-gradient-to-r from-gray-700 to-gray-900 px-4 py-3 text-white flex items-center gap-2">
              <i className="ri-chat-3-line" />
              <span className="text-sm font-semibold">Conversation Transcript</span>
              <span className="ml-auto text-xs text-gray-100">{messages.length || conversation.message_count || 0} messages</span>
            </div>
            <div className="max-h-[600px] overflow-y-auto p-4 space-y-3 bg-gray-50/50">
              {messages.map((msg: any, i: number) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${msg.role === 'user' ? 'bg-gray-700 text-white rounded-br-sm' : 'bg-white text-gray-800 rounded-bl-sm border border-gray-100 shadow-sm'}`}>
                    <MarkdownMessage content={msg.content || ''} isUserMessage={msg.role === 'user'} />
                  </div>
                </div>
              ))}
              {messages.length === 0 && (
                <div className="text-center text-gray-400 py-8">
                  <i className="ri-chat-off-line text-3xl mb-2 block" />
                  <p className="text-sm">No messages in this conversation</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar - 1/3 */}
        <div className="space-y-4">
          {/* Customer Info */}
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <i className="ri-user-3-line text-gray-400" /> Customer Info
            </h3>
            <div className="space-y-2 text-sm">
              {conversation.customer_name && (
                <div className="flex justify-between"><span className="text-gray-500">Name</span><span className="font-medium text-gray-900">{conversation.customer_name}</span></div>
              )}
              {conversation.customer_email && (
                <div className="flex justify-between"><span className="text-gray-500">Email</span><span className="font-medium text-gray-900 text-xs">{conversation.customer_email}</span></div>
              )}
              <div className="flex justify-between"><span className="text-gray-500">Session</span><span className="font-mono text-xs text-gray-600">{conversation.session_id?.slice(0, 20)}</span></div>
              {conversation.user_id && (
                <div className="flex justify-between"><span className="text-gray-500">Auth User</span><span className="text-xs text-gray-700">Logged in</span></div>
              )}
            </div>
          </div>

          {/* Conversation Meta */}
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <i className="ri-information-line text-gray-400" /> Details
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Messages</span><span className="font-semibold">{conversation.message_count || messages.length}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Category</span><span className="font-medium">{conversation.category || '—'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Intent</span><span className="font-medium">{conversation.intent || '—'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">AI Handled</span><span>{conversation.ai_handled ? '✓ Yes' : '✗ No'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Page</span><span className="text-xs font-mono">{conversation.page_context || '—'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Started</span><span className="text-xs">{new Date(conversation.created_at).toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Last Active</span><span className="text-xs">{new Date(conversation.updated_at).toLocaleString()}</span></div>
              {conversation.tags?.length > 0 && (
                <div className="pt-2 flex flex-wrap gap-1">
                  {conversation.tags.map((t: string) => <span key={t} className="px-2 py-0.5 text-[10px] bg-gray-100 text-gray-600 rounded-full">{t}</span>)}
                </div>
              )}
            </div>
          </div>

          {/* Summary */}
          {conversation.summary && (
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
                <i className="ri-file-text-line text-gray-400" /> AI Summary
              </h3>
              <p className="text-sm text-gray-600 leading-relaxed">{conversation.summary}</p>
            </div>
          )}

          {/* AI Memory */}
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <i className="ri-brain-line text-purple-500" /> AI Memory
              <span className="text-[10px] font-normal text-gray-400">({memories.length})</span>
            </h3>
            <div className="space-y-2 mb-3">
              {memories.length === 0 ? (
                <p className="text-xs text-gray-400">No memories stored for this customer</p>
              ) : memories.map((mem) => (
                <div key={mem.id} className="flex items-start gap-2 group">
                  <span className={`shrink-0 mt-0.5 px-1.5 py-0.5 text-[9px] font-bold uppercase rounded ${memoryTypeColors[mem.memory_type] || 'bg-gray-100 text-gray-600'}`}>
                    {mem.memory_type}
                  </span>
                  <p className="text-xs text-gray-700 flex-1">{mem.content}</p>
                  <button onClick={() => deleteMemory(mem.id)} className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-opacity">
                    <i className="ri-close-line text-sm" />
                  </button>
                </div>
              ))}
            </div>
            <div className="border-t border-gray-100 pt-3 space-y-2">
              <select value={memoryType} onChange={(e) => setMemoryType(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs">
                <option value="context">Context</option>
                <option value="preference">Preference</option>
                <option value="issue">Issue</option>
                <option value="instruction">Instruction</option>
                <option value="fact">Fact</option>
              </select>
              <div className="flex gap-2">
                <input value={newMemory} onChange={(e) => setNewMemory(e.target.value)} placeholder="Add a memory note..."
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-purple-500" />
                <button onClick={addMemoryNote} disabled={addingMemory || !newMemory.trim()}
                  className="px-3 py-1.5 text-xs bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-40 transition-colors">
                  {addingMemory ? '...' : 'Add'}
                </button>
              </div>
            </div>
          </div>

          {/* Metadata */}
          {Object.keys(meta).length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
                <i className="ri-code-line text-gray-400" /> Raw Metadata
              </h3>
              <pre className="text-[10px] text-gray-600 bg-gray-50 rounded-lg p-3 overflow-auto max-h-40">{JSON.stringify(meta, null, 2)}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
