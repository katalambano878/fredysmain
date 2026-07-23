import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const days = parseInt(searchParams.get('days') || '30');
  const since = new Date(Date.now() - days * 86400000).toISOString();

  const [conversationsRes, ticketsRes, feedbackRes, categoriesRes, sentimentRes, dailyRes] = await Promise.all([
    supabaseAdmin
      .from('chat_conversations')
      .select('id, created_at, sentiment, category, is_resolved, is_escalated, ai_handled, message_count, duration_seconds')
      .gte('created_at', since)
      .order('created_at', { ascending: true }),
    supabaseAdmin
      .from('support_tickets')
      .select('id, created_at, status, priority, category, resolved_at, first_response_at')
      .gte('created_at', since)
      .order('created_at', { ascending: true }),
    supabaseAdmin
      .from('support_feedback')
      .select('rating, created_at')
      .gte('created_at', since),
    supabaseAdmin
      .from('chat_conversations')
      .select('category')
      .gte('created_at', since)
      .not('category', 'is', null),
    supabaseAdmin
      .from('chat_conversations')
      .select('sentiment')
      .gte('created_at', since),
    supabaseAdmin
      .from('support_analytics_daily')
      .select('*')
      .gte('date', new Date(Date.now() - days * 86400000).toISOString().split('T')[0])
      .order('date', { ascending: true }),
  ]);

  const conversations = conversationsRes.data || [];
  const tickets = ticketsRes.data || [];
  const feedback = feedbackRes.data || [];
  const categories = categoriesRes.data || [];
  const sentiments = sentimentRes.data || [];

  const categoryBreakdown: Record<string, number> = {};
  categories.forEach((c: any) => {
    categoryBreakdown[c.category] = (categoryBreakdown[c.category] || 0) + 1;
  });

  const sentimentBreakdown = { positive: 0, neutral: 0, negative: 0 };
  sentiments.forEach((s: any) => {
    if (s.sentiment === 'positive') sentimentBreakdown.positive++;
    else if (s.sentiment === 'negative') sentimentBreakdown.negative++;
    else sentimentBreakdown.neutral++;
  });

  const ratingDist = [0, 0, 0, 0, 0];
  feedback.forEach((f: any) => { if (f.rating >= 1 && f.rating <= 5) ratingDist[f.rating - 1]++; });

  const resolved = tickets.filter((t: any) => t.resolved_at);
  const avgResolutionMs = resolved.length > 0
    ? resolved.reduce((sum: number, t: any) => sum + (new Date(t.resolved_at).getTime() - new Date(t.created_at).getTime()), 0) / resolved.length
    : 0;

  const responded = tickets.filter((t: any) => t.first_response_at);
  const avgFirstResponseMs = responded.length > 0
    ? responded.reduce((sum: number, t: any) => sum + (new Date(t.first_response_at).getTime() - new Date(t.created_at).getTime()), 0) / responded.length
    : 0;

  return NextResponse.json({
    summary: {
      totalConversations: conversations.length,
      totalTickets: tickets.length,
      totalFeedback: feedback.length,
      avgRating: feedback.length > 0 ? (feedback.reduce((s: number, f: any) => s + f.rating, 0) / feedback.length).toFixed(2) : '0',
      aiHandled: conversations.filter((c: any) => c.ai_handled).length,
      escalated: conversations.filter((c: any) => c.is_escalated).length,
      resolved: conversations.filter((c: any) => c.is_resolved).length,
      avgResolutionHours: (avgResolutionMs / 3600000).toFixed(1),
      avgFirstResponseMinutes: (avgFirstResponseMs / 60000).toFixed(1),
    },
    categoryBreakdown,
    sentimentBreakdown,
    ratingDistribution: ratingDist,
    dailyData: dailyRes.data || [],
    ticketStatusBreakdown: {
      open: tickets.filter((t: any) => t.status === 'open').length,
      in_progress: tickets.filter((t: any) => t.status === 'in_progress').length,
      waiting_customer: tickets.filter((t: any) => t.status === 'waiting_customer').length,
      resolved: tickets.filter((t: any) => t.status === 'resolved').length,
      closed: tickets.filter((t: any) => t.status === 'closed').length,
    },
    ticketPriorityBreakdown: {
      low: tickets.filter((t: any) => t.priority === 'low').length,
      medium: tickets.filter((t: any) => t.priority === 'medium').length,
      high: tickets.filter((t: any) => t.priority === 'high').length,
      urgent: tickets.filter((t: any) => t.priority === 'urgent').length,
    },
  });
}
