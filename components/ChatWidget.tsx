'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { useCart } from '@/context/CartContext';
import type { CartItem } from '@/context/CartContext';
import MarkdownMessage from '@/components/MarkdownMessage';

// ─── Types ──────────────────────────────────────────────────────────────────

type ChatProduct = {
  id: string;
  name: string;
  slug: string;
  price: number;
  image: string;
  quantity: number;
  maxStock: number;
  moq: number;
  inStock: boolean;
  /** Lowest size price, when the outfit is priced per size (its own price is then 0). */
  fromPrice?: number;
  /** True when the shopper has to pick a size on the product page. */
  hasSizes?: boolean;
};

type ChatOrder = {
  id: string;
  order_number: string;
  status: string;
  payment_status: string;
  total: number;
  created_at: string;
  tracking_number?: string;
  items: { name: string; quantity: number; price: number }[];
};

type ChatTicket = {
  id: string;
  ticket_number: number;
  status: string;
  subject: string;
};

type ChatReturn = {
  id: string;
  status: string;
  order_number: string;
  reason: string;
};

type ChatCoupon = {
  valid: boolean;
  code: string;
  reason?: string;
  type?: string;
  value?: number;
  minimum_purchase?: number;
  maximum_discount?: number;
  expires?: string;
};

type ChatAction = {
  type: 'add_to_cart' | 'view_product' | 'view_order' | 'track_order' | 'apply_coupon' | 'payment_link';
  product?: ChatProduct;
  orderId?: string;
  orderNumber?: string;
  couponCode?: string;
  label?: string;
  paymentUrl?: string;
};

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  actions?: ChatAction[];
  quickReplies?: string[];
  products?: ChatProduct[];
  orderCard?: ChatOrder;
  ticketCard?: ChatTicket;
  returnCard?: ChatReturn;
  couponCard?: ChatCoupon;
  timestamp?: number;
  isVoice?: boolean;
  audioUrl?: string;
};

// ─── Constants ──────────────────────────────────────────────────────────────

const STORAGE_KEY = 'sl-chat-messages';
const SESSION_KEY = 'sl-chat-session';
const WIDGET_TITLE = "Freby’s Fashion GH";

function getSessionId(): string {
  if (typeof window === 'undefined') return '';
  let id = sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id = `chat-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    sessionStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

function loadMessages(): ChatMessage[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return [];
}

function saveMessages(msgs: ChatMessage[]) {
  try {
    const last30 = msgs.slice(-30);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(last30));
  } catch {}
}

// ─── Status Helpers ─────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  processing: 'Processing',
  shipped: 'Packaged',
  dispatched_to_rider: 'Dispatched To Rider',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
  open: 'Open',
  in_progress: 'In Progress',
  waiting_customer: 'Waiting',
  resolved: 'Resolved',
  closed: 'Closed',
  approved: 'Approved',
  rejected: 'Rejected',
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  processing: 'bg-blue-100 text-blue-700',
  shipped: 'bg-purple-100 text-purple-700',
  dispatched_to_rider: 'bg-indigo-100 text-indigo-700',
  delivered: 'bg-gray-100 text-gray-900',
  cancelled: 'bg-red-100 text-red-700',
  open: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-yellow-100 text-yellow-700',
  resolved: 'bg-gray-100 text-gray-900',
  approved: 'bg-gray-100 text-gray-900',
  rejected: 'bg-red-100 text-red-700',
  paid: 'bg-gray-100 text-gray-900',
  failed: 'bg-red-100 text-red-700',
};

function StatusBadge({ status }: { status: string }) {
  const label = STATUS_LABELS[status] || status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const color = STATUS_COLORS[status] || 'bg-gray-100 text-gray-700';
  return <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${color}`}>{label}</span>;
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [unread, setUnread] = useState(0);
  const [initialized, setInitialized] = useState(false);
  const [mounted, setMounted] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { cart, addToCart, clearCart, setIsCartOpen } = useCart();
  const pathname = usePathname();

  // Voice chat state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [voiceProcessing, setVoiceProcessing] = useState<'transcribing' | 'speaking' | null>(null);
  const [currentlyPlayingUrl, setCurrentlyPlayingUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const sendVoiceRef = useRef<(blob: Blob) => void>(() => {});

  useEffect(() => {
    setMounted(true);
  }, []);

  // Initialize from localStorage
  useEffect(() => {
    const stored = loadMessages();
    if (stored.length > 0) {
      setMessages(stored);
    } else {
      setMessages([
        {
          role: 'assistant',
          content: "Hi! I'm your AI shopping assistant. I can help you find products, track orders, check discounts, and much more. What can I help you with?",
          quickReplies: ['Find a product', 'Track my order', 'What do you recommend?', 'Store info'],
          timestamp: Date.now(),
        },
      ]);
    }
    setInitialized(true);
  }, []);

  // Persist messages
  useEffect(() => {
    if (initialized && messages.length > 0) {
      saveMessages(messages);
    }
  }, [messages, initialized]);

  // Auto-scroll
  useEffect(() => {
    if (listRef.current) {
      requestAnimationFrame(() => {
        listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
      });
    }
  }, [messages, loading, open]);

  // Focus input when opening
  useEffect(() => {
    if (open) {
      setUnread(0);
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [open]);

  // Send message
  const send = useCallback(async (text?: string) => {
    const msgText = (text || input).trim();
    if (!msgText || loading) return;

    if (!text) setInput('');
    const userMsg: ChatMessage = { role: 'user', content: msgText, timestamp: Date.now() };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const cartPayload = cart.length > 0
        ? cart.map(c => ({ id: c.id, name: c.name, price: c.price, quantity: c.quantity, slug: c.slug }))
        : undefined;

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          messages: messages.slice(-18).map((m) => ({ role: m.role, content: m.content })),
          newMessage: msgText,
          sessionId: getSessionId(),
          pagePath: pathname,
          cartItems: cartPayload,
        }),
      });

      const data = await res.json();

      // Clear cart if a payment link action was returned (order was created)
      if (data.actions?.some((a: ChatAction) => a.type === 'payment_link')) {
        clearCart();
      }

      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: data.message || "Sorry, I couldn't process that.",
        actions: data.actions,
        quickReplies: data.quickReplies,
        products: data.products,
        orderCard: data.orderCard,
        ticketCard: data.ticketCard,
        returnCard: data.returnCard,
        couponCard: data.couponCard,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
      if (!open) setUnread((u) => u + 1);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Connection error. Please check your internet and try again.', quickReplies: ['Try again'], timestamp: Date.now() },
      ]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, open, pathname, cart, clearCart]);

  const handleAddToCart = useCallback((product: ChatProduct) => {
    // Never put a line without a price in the cart: checkout would refuse it.
    if (!(Number(product.price) > 0) || product.hasSizes) return;
    const item: CartItem = {
      id: product.id,
      name: product.name,
      price: product.price,
      image: product.image,
      quantity: product.moq || 1,
      slug: product.slug,
      maxStock: product.maxStock,
      moq: product.moq,
    };
    addToCart(item);
    setIsCartOpen(true);
  }, [addToCart, setIsCartOpen]);

  const handleQuickReply = useCallback((text: string) => {
    send(text);
  }, [send]);

  // ─── Voice Chat ──────────────────────────────────────────────────────────

  const stopAllAudio = useCallback(() => {
    if (audioElRef.current) { audioElRef.current.pause(); audioElRef.current = null; }
    setCurrentlyPlayingUrl(null);
  }, []);

  const togglePlayMessage = useCallback((audioUrl: string) => {
    if (currentlyPlayingUrl === audioUrl && audioElRef.current) {
      audioElRef.current.pause();
      setCurrentlyPlayingUrl(null);
      audioElRef.current = null;
      return;
    }
    if (audioElRef.current) { audioElRef.current.pause(); audioElRef.current = null; }
    const audio = new Audio(audioUrl);
    audioElRef.current = audio;
    audio.onended = () => { setCurrentlyPlayingUrl(null); audioElRef.current = null; };
    audio.onerror = () => { setCurrentlyPlayingUrl(null); audioElRef.current = null; };
    audio.play().catch(() => setCurrentlyPlayingUrl(null));
    setCurrentlyPlayingUrl(audioUrl);
  }, [currentlyPlayingUrl]);

  const sendVoiceMessage = useCallback(async (audioBlob: Blob) => {
    setVoiceProcessing('transcribing');
    setLoading(true);
    const userMsg: ChatMessage = { role: 'user', content: '🎤 Transcribing voice...', isVoice: true, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);

    try {
      const form = new FormData();
      const ext = audioBlob.type.includes('mp4') ? 'mp4' : audioBlob.type.includes('ogg') ? 'ogg' : 'webm';
      form.append('audio', audioBlob, `recording.${ext}`);
      const sttRes = await fetch('/api/chat/transcribe', { method: 'POST', body: form });
      const sttData = await sttRes.json();

      if (!sttData.text?.trim()) {
        setMessages(prev => { const u = [...prev]; u[u.length - 1] = { ...u[u.length - 1], content: '🎤 (could not understand audio)' }; return u; });
        setLoading(false);
        setVoiceProcessing(null);
        return;
      }

      const transcribedText = sttData.text.trim();
      setMessages(prev => { const u = [...prev]; u[u.length - 1] = { ...u[u.length - 1], content: transcribedText }; return u; });
      setVoiceProcessing(null);

      const voiceCartPayload = cart.length > 0
        ? cart.map(c => ({ id: c.id, name: c.name, price: c.price, quantity: c.quantity, slug: c.slug }))
        : undefined;

      const chatRes = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          messages: messages.slice(-18).map(m => ({ role: m.role, content: m.content })),
          newMessage: transcribedText,
          sessionId: getSessionId(),
          pagePath: pathname,
          cartItems: voiceCartPayload,
        }),
      });
      const chatData = await chatRes.json();

      if (chatData.actions?.some((a: ChatAction) => a.type === 'payment_link')) {
        clearCart();
      }

      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: chatData.message || "Sorry, I couldn't process that.",
        actions: chatData.actions,
        quickReplies: chatData.quickReplies,
        products: chatData.products,
        orderCard: chatData.orderCard,
        ticketCard: chatData.ticketCard,
        returnCard: chatData.returnCard,
        couponCard: chatData.couponCard,
        isVoice: true,
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, assistantMsg]);
      if (!open) setUnread(u => u + 1);

      if (chatData.message) {
        setVoiceProcessing('speaking');
        try {
          const ttsRes = await fetch('/api/chat/speak', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: chatData.message }),
          });
          if (ttsRes.ok) {
            const ttsBlob = await ttsRes.blob();
            const aUrl = URL.createObjectURL(ttsBlob);
            setMessages(prev => { const u = [...prev]; u[u.length - 1] = { ...u[u.length - 1], audioUrl: aUrl }; return u; });
            const audio = new Audio(aUrl);
            audioElRef.current = audio;
            audio.onended = () => { setCurrentlyPlayingUrl(null); audioElRef.current = null; };
            audio.onerror = () => { setCurrentlyPlayingUrl(null); audioElRef.current = null; };
            try { await audio.play(); setCurrentlyPlayingUrl(aUrl); } catch { /* autoplay blocked */ }
          }
        } catch (err) { console.error('TTS error:', err); }
        setVoiceProcessing(null);
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Connection error. Please try again.', quickReplies: ['Try again'], timestamp: Date.now() }]);
    } finally {
      setLoading(false);
      setVoiceProcessing(null);
    }
  }, [messages, open, pathname, cart, clearCart]);

  sendVoiceRef.current = sendVoiceMessage;

  const stopRecording = useCallback(() => {
    if (recordingTimerRef.current) { clearInterval(recordingTimerRef.current); recordingTimerRef.current = null; }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') { mediaRecorderRef.current.stop(); }
    setIsRecording(false);
    setRecordingDuration(0);
  }, []);

  const cancelRecording = useCallback(() => {
    if (recordingTimerRef.current) { clearInterval(recordingTimerRef.current); recordingTimerRef.current = null; }
    if (mediaRecorderRef.current) {
      const stream = mediaRecorderRef.current.stream;
      mediaRecorderRef.current.onstop = () => { stream?.getTracks().forEach(t => t.stop()); };
      if (mediaRecorderRef.current.state !== 'inactive') { mediaRecorderRef.current.stop(); }
    }
    audioChunksRef.current = [];
    setIsRecording(false);
    setRecordingDuration(0);
  }, []);

  const startRecording = useCallback(async () => {
    stopAllAudio();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '';
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        if (blob.size > 100) sendVoiceRef.current(blob);
      };
      mediaRecorderRef.current = recorder;
      recorder.start(250);
      setIsRecording(true);
      setRecordingDuration(0);
      recordingTimerRef.current = setInterval(() => setRecordingDuration(d => d + 1), 1000);
    } catch (err: any) {
      console.error('Mic error:', err);
    }
  }, [stopAllAudio]);

  useEffect(() => {
    if (isRecording && recordingDuration >= 60) stopRecording();
  }, [isRecording, recordingDuration, stopRecording]);

  useEffect(() => {
    return () => {
      if (audioElRef.current) { audioElRef.current.pause(); audioElRef.current = null; }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stream?.getTracks().forEach(t => t.stop());
        mediaRecorderRef.current.stop();
      }
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    };
  }, []);

  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackRating, setFeedbackRating] = useState(0);
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackSent, setFeedbackSent] = useState(false);

  const performClearChat = useCallback(() => {
    const initial: ChatMessage[] = [{
      role: 'assistant',
      content: "Chat cleared! How can I help you today?",
      quickReplies: ['Find a product', 'Track my order', 'What do you recommend?', 'Store info'],
      timestamp: Date.now(),
    }];
    setMessages(initial);
    saveMessages(initial);
    sessionStorage.removeItem(SESSION_KEY);
    setShowFeedback(false);
    setFeedbackRating(0);
    setFeedbackText('');
    setFeedbackSent(false);
  }, []);

  const performClearChatRef = useRef<() => void>(() => {});
  useEffect(() => {
    performClearChatRef.current = performClearChat;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally run every commit so ref stays current; adding performClearChat to deps can contribute to TDZ in some bundles
  }, []);

  const clearChat = useCallback(() => {
    if (messages.length > 3 && !feedbackSent) {
      setShowFeedback(true);
      return;
    }
    performClearChatRef.current();
  }, [messages.length, feedbackSent]);

  const submitFeedback = useCallback(async () => {
    if (feedbackRating === 0) return;
    try {
      await fetch('/api/support/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating: feedbackRating,
          feedback_text: feedbackText || null,
          feedback_categories: [],
        }),
      });
    } catch {}
    setFeedbackSent(true);
    setShowFeedback(false);
    performClearChatRef.current();
  }, [feedbackRating, feedbackText]);

  if (!mounted) return null;

  return (
    <>
      {/* Floating Toggle Button — above mobile bottom nav */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-[5.5rem] right-3 z-[9999] w-14 h-14 rounded-full bg-gray-700 hover:bg-gray-800 text-white shadow-2xl flex items-center justify-center transition-all duration-300 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2 sm:bottom-6 sm:right-4"
          aria-label="Open chat"
        >
          <i className="ri-chat-smile-3-line text-2xl" aria-hidden />
          {unread > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-bounce">
              {unread}
            </span>
          )}
        </button>
      )}

      {/* Chat Panel */}
      {open && (
        <div
          className="fixed bottom-[5.5rem] right-3 left-3 z-[9998] h-[75vh] max-h-[600px] bg-white flex flex-col overflow-hidden rounded-2xl shadow-2xl border border-gray-200/80 sm:left-auto sm:bottom-6 sm:right-4 sm:w-[400px] sm:h-[min(75vh,600px)]"
          role="dialog"
          aria-label="Chat with us"
          style={{ animation: 'chatSlideUp 0.3s cubic-bezier(0.32, 0.72, 0, 1) forwards' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-gray-700 to-gray-800 text-white flex-shrink-0 rounded-t-2xl">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                <i className="ri-robot-2-line text-lg" aria-hidden />
              </div>
              <div className="min-w-0">
                <h3 className="font-semibold text-sm leading-tight truncate">{WIDGET_TITLE}</h3>
                <p className="text-[11px] text-gray-200 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full inline-block animate-pulse flex-shrink-0" />
                  AI Assistant &middot; Online
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                type="button"
                onClick={clearChat}
                className="w-9 h-9 rounded-lg hover:bg-white/15 flex items-center justify-center transition-colors"
                title="Clear chat"
              >
                <i className="ri-delete-bin-6-line text-base" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-9 h-9 rounded-lg hover:bg-white/15 flex items-center justify-center transition-colors"
                title="Close"
              >
                <i className="ri-close-line text-xl" aria-hidden />
              </button>
            </div>
          </div>

          {/* Message List */}
          <div ref={listRef} className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 bg-gray-50/50">
            {messages.map((m, i) => (
              <MessageBubble
                key={i}
                message={m}
                onAddToCart={handleAddToCart}
                onQuickReply={handleQuickReply}
                isLast={i === messages.length - 1}
                onTogglePlay={togglePlayMessage}
                currentlyPlayingUrl={currentlyPlayingUrl}
              />
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-100 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
                  <div className="flex items-center gap-2">
                    {voiceProcessing === 'speaking' ? (
                      <div className="flex items-center gap-1.5">
                        <div className="flex gap-0.5 items-end h-4">
                          <span className="w-1 bg-gray-400 rounded-full animate-voice-bar" style={{ animationDelay: '0ms', height: '40%' }} />
                          <span className="w-1 bg-gray-400 rounded-full animate-voice-bar" style={{ animationDelay: '150ms', height: '70%' }} />
                          <span className="w-1 bg-gray-400 rounded-full animate-voice-bar" style={{ animationDelay: '300ms', height: '50%' }} />
                          <span className="w-1 bg-gray-400 rounded-full animate-voice-bar" style={{ animationDelay: '100ms', height: '80%' }} />
                          <span className="w-1 bg-gray-400 rounded-full animate-voice-bar" style={{ animationDelay: '250ms', height: '60%' }} />
                        </div>
                        <span className="text-xs text-gray-400 ml-1">Generating voice...</span>
                      </div>
                    ) : (
                      <>
                        <div className="flex gap-1">
                          <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                          <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                          <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                        <span className="text-xs text-gray-400 ml-1">
                          {voiceProcessing === 'transcribing' ? 'Transcribing voice...' : 'Thinking...'}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Feedback Panel */}
          {showFeedback && (
            <div className="border-t border-gray-100 p-3 sm:p-4 bg-gradient-to-r from-gray-100 to-gray-50 flex-shrink-0 space-y-2.5">
              <p className="text-sm font-semibold text-gray-800">How was your experience?</p>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button key={star} type="button" onClick={() => setFeedbackRating(star)}
                    className={`text-3xl sm:text-2xl transition-transform hover:scale-110 active:scale-95 ${star <= feedbackRating ? 'text-amber-400' : 'text-gray-300'}`}>
                    <i className={star <= feedbackRating ? 'ri-star-fill' : 'ri-star-line'} />
                  </button>
                ))}
              </div>
              {feedbackRating > 0 && (
                <input value={feedbackText} onChange={(e) => setFeedbackText(e.target.value)}
                  placeholder="Any feedback? (optional)" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-900" />
              )}
              <div className="flex gap-2">
                <button type="button" onClick={submitFeedback} disabled={feedbackRating === 0}
                  className="px-4 py-2 text-sm font-medium bg-gray-700 text-white rounded-lg hover:bg-gray-800 disabled:opacity-40 transition-colors active:scale-95">
                  Submit &amp; Clear
                </button>
                <button type="button" onClick={() => performClearChatRef.current()}
                  className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors">
                  Skip
                </button>
              </div>
            </div>
          )}

          {/* Input Area */}
          <div className="p-3 border-t border-gray-100 bg-white flex-shrink-0 rounded-b-2xl">
            {isRecording ? (
              <div className="flex items-center gap-3">
                <button type="button" onClick={cancelRecording} className="shrink-0 w-10 h-10 rounded-xl bg-gray-200 hover:bg-gray-300 text-gray-600 flex items-center justify-center transition-all active:scale-95" aria-label="Cancel recording">
                  <i className="ri-close-line text-lg" aria-hidden />
                </button>
                <div className="flex-1 flex items-center justify-center gap-2.5">
                  <span className="w-3 h-3 bg-red-500 rounded-full animate-recording-pulse flex-shrink-0" />
                  <span className="text-sm font-medium text-red-600 tabular-nums">
                    {Math.floor(recordingDuration / 60)}:{(recordingDuration % 60).toString().padStart(2, '0')}
                  </span>
                  <span className="text-xs text-gray-400">Recording...</span>
                </div>
                <button type="button" onClick={stopRecording} className="shrink-0 w-11 h-11 sm:w-10 sm:h-10 rounded-xl bg-red-500 hover:bg-red-600 text-white flex items-center justify-center transition-all active:scale-95 shadow-lg shadow-red-500/25" aria-label="Stop and send">
                  <i className="ri-stop-fill text-lg" aria-hidden />
                </button>
              </div>
            ) : (
              <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Type or use voice..."
                  className="flex-1 min-w-0 rounded-xl border border-gray-200 bg-gray-50 px-3 sm:px-4 py-2.5 text-[16px] sm:text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-gray-900 transition-all"
                  disabled={loading}
                  aria-label="Message"
                />
                {input.trim() ? (
                  <button
                    type="submit"
                    disabled={loading}
                    className="shrink-0 w-11 h-11 sm:w-10 sm:h-10 rounded-xl bg-gray-700 hover:bg-gray-800 text-white flex items-center justify-center disabled:opacity-40 disabled:pointer-events-none transition-all active:scale-95"
                    aria-label="Send"
                  >
                    <i className="ri-send-plane-fill text-lg" aria-hidden />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={startRecording}
                    disabled={loading}
                    className="shrink-0 w-11 h-11 sm:w-10 sm:h-10 rounded-xl bg-gray-700 hover:bg-gray-800 text-white flex items-center justify-center disabled:opacity-40 disabled:pointer-events-none transition-all active:scale-95"
                    aria-label="Voice message"
                  >
                    <i className="ri-mic-line text-lg" aria-hidden />
                  </button>
                )}
              </form>
            )}
          </div>
        </div>
      )}

      {/* Global Animation */}
      <style jsx global>{`
        @keyframes chatSlideUp {
          from { opacity: 0; transform: translateY(20px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes chatFadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .chat-msg-animate {
          animation: chatFadeIn 0.25s ease-out forwards;
        }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
        @keyframes recordingPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(1.35); }
        }
        .animate-recording-pulse {
          animation: recordingPulse 1.2s ease-in-out infinite;
        }
        @keyframes voiceBar {
          0%, 100% { height: 25%; }
          50% { height: 100%; }
        }
        .animate-voice-bar {
          animation: voiceBar 0.7s ease-in-out infinite;
        }
      `}</style>
    </>
  );
}

// ─── Message Bubble ─────────────────────────────────────────────────────────

function MessageBubble({
  message,
  onAddToCart,
  onQuickReply,
  isLast,
  onTogglePlay,
  currentlyPlayingUrl,
}: {
  message: ChatMessage;
  onAddToCart: (p: ChatProduct) => void;
  onQuickReply: (text: string) => void;
  isLast: boolean;
  onTogglePlay: (url: string) => void;
  currentlyPlayingUrl: string | null;
}) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} chat-msg-animate`}>
      <div className={`max-w-[85%] sm:max-w-[88%] space-y-2`}>
        {/* Text bubble */}
        {message.content && (
          <div
            className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
              isUser
                ? 'bg-gray-700 text-white rounded-br-sm shadow-sm'
                : 'bg-white text-gray-800 rounded-bl-sm border border-gray-100 shadow-sm'
            }`}
          >
            {isUser && message.isVoice && (
              <div className="flex items-center gap-1.5 mb-1 opacity-75">
                <i className="ri-mic-line text-[11px]" />
                <span className="text-[10px]">Voice message</span>
              </div>
            )}
            <MarkdownMessage content={message.content} isUserMessage={isUser} />
          </div>
        )}

        {/* Voice playback for assistant */}
        {!isUser && message.audioUrl && (
          <button
            type="button"
            onClick={() => onTogglePlay(message.audioUrl!)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all active:scale-95 ${
              currentlyPlayingUrl === message.audioUrl
                ? 'bg-gray-100 text-gray-900 border border-gray-200'
                : 'bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200'
            }`}
          >
            <i className={currentlyPlayingUrl === message.audioUrl ? 'ri-pause-circle-fill text-base' : 'ri-play-circle-fill text-base'} />
            {currentlyPlayingUrl === message.audioUrl ? 'Playing...' : 'Play voice'}
          </button>
        )}

        {/* Product Cards */}
        {message.products && message.products.length > 0 && (
          <div className="space-y-2">
            {message.products.map((p) => (
              <ProductCard key={p.id} product={p} onAddToCart={onAddToCart} />
            ))}
          </div>
        )}

        {/* Legacy add_to_cart actions (when no products array) */}
        {!message.products && message.actions && message.actions.length > 0 && (
          <div className="space-y-2">
            {message.actions.map((a) =>
              a.type === 'add_to_cart' && a.product ? (
                <ProductCard key={a.product.id} product={a.product} onAddToCart={onAddToCart} />
              ) : null
            )}
          </div>
        )}

        {/* Order Card */}
        {message.orderCard && <OrderCard order={message.orderCard} />}

        {/* Ticket Card */}
        {message.ticketCard && <TicketCard ticket={message.ticketCard} />}

        {/* Return Card */}
        {message.returnCard && <ReturnCard ret={message.returnCard} />}

        {/* Coupon Card */}
        {message.couponCard && <CouponCard coupon={message.couponCard} />}

        {/* Payment Link Button */}
        {message.actions?.filter(a => a.type === 'payment_link').map((a, idx) => (
          <a
            key={`pay-${idx}`}
            href={a.paymentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-gray-700 hover:bg-gray-800 text-white font-semibold rounded-xl shadow-md transition-all active:scale-[0.98] text-sm"
          >
            <i className="ri-secure-payment-line text-lg" />
            {a.label || 'Pay Now'}
          </a>
        ))}

        {/* Quick Replies */}
        {isLast && !isUser && message.quickReplies && message.quickReplies.length > 0 && (
          <div className="flex gap-1.5 pt-1 overflow-x-auto pb-1 -mb-1 scrollbar-hide flex-nowrap sm:flex-wrap">
            {message.quickReplies.map((qr) => (
              <button
                key={qr}
                type="button"
                onClick={() => onQuickReply(qr)}
                className="px-3 py-1.5 text-xs font-medium bg-white border border-gray-200 text-gray-900 rounded-full hover:bg-gray-100 hover:border-gray-300 transition-all active:scale-95 shadow-sm whitespace-nowrap flex-shrink-0"
              >
                {qr}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Product Card ───────────────────────────────────────────────────────────

function ProductCard({ product, onAddToCart }: { product: ChatProduct; onAddToCart: (p: ChatProduct) => void }) {
  const ownPrice = Number(product.price) || 0;
  const fromPrice = Number(product.fromPrice) || 0;
  // An outfit priced per size cannot go straight into the cart: the shopper has to choose the size first.
  const needsSize = product.hasSizes === true || !(ownPrice > 0);
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2.5 p-2.5 sm:p-3">
        <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
          {product.image ? (
            <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-300">
              <i className="ri-image-line text-xl" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs sm:text-sm font-medium text-gray-900 truncate">{product.name}</p>
          <p className="text-sm font-bold text-gray-700">
            {needsSize
              ? fromPrice > 0
                ? `From GH₵${fromPrice.toFixed(2)}`
                : 'See sizes and prices'
              : `GH₵${ownPrice.toFixed(2)}`}
          </p>
          <span className="text-[10px] font-medium text-gray-600">
            {product.inStock ? 'In stock' : 'Made to order'}
          </span>
        </div>
        <div className="flex flex-col gap-1.5 flex-shrink-0">
          {product.inStock && !needsSize && (
            <button
              type="button"
              onClick={() => onAddToCart(product)}
              className="px-2.5 sm:px-3 py-1.5 bg-gray-700 hover:bg-gray-800 text-white text-xs font-semibold rounded-lg transition-all active:scale-95"
            >
              <i className="ri-shopping-cart-line mr-0.5 sm:mr-1" />
              Add
            </button>
          )}
          <a
            href={`/product/${product.slug}`}
            className="px-2.5 sm:px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium rounded-lg transition-all text-center"
          >
            {needsSize ? 'Choose size' : 'View'}
          </a>
        </div>
      </div>
    </div>
  );
}

// ─── Order Card ─────────────────────────────────────────────────────────────

function OrderCard({ order }: { order: ChatOrder }) {
  const statusSteps = ['pending', 'processing', 'shipped', 'dispatched_to_rider', 'delivered'];
  const currentIdx = statusSteps.indexOf(order.status);

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-500">Order</p>
          <p className="text-sm font-bold text-gray-900">{order.order_number}</p>
        </div>
        <StatusBadge status={order.status} />
      </div>

      {/* Mini Progress */}
      {currentIdx >= 0 && order.status !== 'cancelled' && (
        <div className="px-4 py-2">
          <div className="flex items-center gap-1">
            {statusSteps.map((step, idx) => (
              <div key={step} className="flex items-center flex-1">
                <div className={`w-2 h-2 rounded-full ${idx <= currentIdx ? 'bg-gray-500' : 'bg-gray-200'}`} />
                {idx < statusSteps.length - 1 && (
                  <div className={`flex-1 h-0.5 ${idx < currentIdx ? 'bg-gray-500' : 'bg-gray-200'}`} />
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[9px] text-gray-400">Ordered</span>
            <span className="text-[9px] text-gray-400">Delivered</span>
          </div>
        </div>
      )}

      <div className="px-4 py-2 space-y-1">
        {order.items.slice(0, 3).map((item, i) => (
          <div key={i} className="flex justify-between text-xs">
            <span className="text-gray-600 truncate flex-1">{item.name} x{item.quantity}</span>
            <span className="text-gray-900 font-medium ml-2">GH₵{item.price.toFixed(2)}</span>
          </div>
        ))}
        {order.items.length > 3 && <p className="text-[10px] text-gray-400">+{order.items.length - 3} more items</p>}
      </div>
      <div className="px-4 py-2 border-t border-gray-50 flex justify-between items-center">
        <span className="text-xs text-gray-500">{new Date(order.created_at).toLocaleDateString('en-GB')}</span>
        <span className="text-sm font-bold text-gray-900">GH₵{order.total.toFixed(2)}</span>
      </div>
      {order.tracking_number && (
        <div className="px-4 pb-2">
          <p className="text-[10px] text-gray-400">
            Tracking: <span className="font-mono text-gray-600">{order.tracking_number}</span>
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Ticket Card ────────────────────────────────────────────────────────────

function TicketCard({ ticket }: { ticket: ChatTicket }) {
  return (
    <div className="bg-white rounded-xl border border-blue-100 shadow-sm overflow-hidden">
      <div className="px-4 py-3 bg-blue-50/50">
        <div className="flex items-center gap-2 mb-1">
          <i className="ri-customer-service-2-line text-blue-600" />
          <span className="text-xs font-bold text-blue-700">Support Ticket Created</span>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-gray-900">{ticket.subject}</p>
          <span className="text-xs font-mono text-blue-600">#{ticket.ticket_number}</span>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          Our team will review your ticket and get back to you. You can also check the status in your account.
        </p>
      </div>
    </div>
  );
}

// ─── Return Card ────────────────────────────────────────────────────────────

function ReturnCard({ ret }: { ret: ChatReturn }) {
  return (
    <div className="bg-white rounded-xl border border-orange-100 shadow-sm overflow-hidden">
      <div className="px-4 py-3 bg-orange-50/50">
        <div className="flex items-center gap-2 mb-1">
          <i className="ri-arrow-go-back-line text-orange-600" />
          <span className="text-xs font-bold text-orange-700">Return Request Submitted</span>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-gray-600">Order: <span className="font-medium">{ret.order_number}</span></p>
          <p className="text-xs text-gray-600">Reason: <span className="font-medium">{ret.reason}</span></p>
          <StatusBadge status={ret.status} />
        </div>
        <p className="text-xs text-gray-500 mt-2">
          We&apos;ll review your return request and notify you of the next steps via email.
        </p>
      </div>
    </div>
  );
}

// ─── Coupon Card ────────────────────────────────────────────────────────────

function CouponCard({ coupon }: { coupon: ChatCoupon }) {
  return (
    <div className={`rounded-xl border shadow-sm overflow-hidden ${coupon.valid ? 'bg-white border-gray-100' : 'bg-white border-red-100'}`}>
      <div className={`px-4 py-3 ${coupon.valid ? 'bg-gray-100/50' : 'bg-red-50/50'}`}>
        <div className="flex items-center gap-2 mb-1">
          <i className={`${coupon.valid ? 'ri-coupon-3-line text-gray-600' : 'ri-close-circle-line text-red-500'}`} />
          <span className={`text-xs font-bold ${coupon.valid ? 'text-gray-900' : 'text-red-600'}`}>
            {coupon.valid ? 'Valid Coupon' : 'Invalid Coupon'}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="font-mono text-sm font-bold text-gray-900 bg-gray-100 px-2 py-0.5 rounded">{coupon.code}</span>
          {coupon.valid && coupon.value && (
            <span className="text-sm font-bold text-gray-600">
              {coupon.type === 'percentage' ? `${coupon.value}% OFF` : coupon.type === 'free_shipping' ? 'Free Shipping' : `GH₵${coupon.value.toFixed(2)} OFF`}
            </span>
          )}
        </div>
        {!coupon.valid && coupon.reason && (
          <p className="text-xs text-red-500 mt-1">{coupon.reason}</p>
        )}
        {coupon.valid && coupon.minimum_purchase && (
          <p className="text-[10px] text-gray-400 mt-1">Min. purchase: GH₵{coupon.minimum_purchase.toFixed(2)}</p>
        )}
        {coupon.valid && coupon.expires && (
          <p className="text-[10px] text-gray-400">Expires: {new Date(coupon.expires).toLocaleDateString('en-GB')}</p>
        )}
      </div>
    </div>
  );
}
