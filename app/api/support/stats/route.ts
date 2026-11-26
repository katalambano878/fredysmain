import { NextRequest, NextResponse } from 'next/server';
import { accraDay } from '@/app/api/admin/_lib/accra-day';
import { denyUnlessPermission } from '@/lib/admin-route-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

/** Rows matching a filter. Null when the count could not be read, so the page can show a dash. */
async function countOf(table: string, apply?: (q: any) => any): Promise<number | null> {
  try {
    let query = supabaseAdmin.from(table).select('id', { count: 'exact', head: true });
    if (apply) query = apply(query);
    const { count, error } = await query;
    if (error) return null;
    return count ?? 0;
  } catch {
    return null;
  }
}

/**
 * GET /api/support/stats
 * The Support Hub's figures, in the shape that page reads. A figure that cannot be worked out is null.
 */
export async function GET(req: NextRequest) {
  const authErr = await denyUnlessPermission(req, ['support']);
  if (authErr) return authErr;

  const now = new Date();
  // The shop runs on Accra time, which is UTC.
  const startOfToday = accraDay(null, now).start;
  const weekAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000).toISOString();
  const openStatuses = ['open', 'in_progress', 'waiting_customer'];

  const [
    openTickets,
    urgentTickets,
    resolvedWeek,
    conversationsTotal,
    conversationsToday,
    conversationsWeek,
    resolvedConversations,
    escalated,
    kbArticles,
    memories,
  ] = await Promise.all([
    countOf('support_tickets', (q) => q.in('status', openStatuses)),
    countOf('support_tickets', (q) => q.in('status', openStatuses).eq('priority', 'urgent')),
    countOf('support_tickets', (q) => q.gte('resolved_at', weekAgo)),
    countOf('chat_conversations'),
    countOf('chat_conversations', (q) => q.gte('created_at', startOfToday)),
    countOf('chat_conversations', (q) => q.gte('created_at', weekAgo)),
    countOf('chat_conversations', (q) => q.eq('is_resolved', true).eq('is_escalated', false)),
    countOf('chat_conversations', (q) => q.eq('is_escalated', true)),
    countOf('support_knowledge_base', (q) => q.eq('is_published', true)),
    countOf('ai_memory'),
  ]);

  let avgRating: number | null = null;
  let totalReviews: number | null = null;
  try {
    const { data, error } = await supabaseAdmin.from('support_feedback').select('rating').limit(5000);
    if (!error) {
      const ratings = (data || []).map((r: any) => Number(r.rating)).filter((n: number) => n >= 1 && n <= 5);
      totalReviews = ratings.length;
      avgRating = ratings.length
        ? Math.round((ratings.reduce((s: number, n: number) => s + n, 0) / ratings.length) * 10) / 10
        : null;
    }
  } catch {
    /* leave as null */
  }

  const resolutionRate =
    conversationsTotal && resolvedConversations != null
      ? Math.round((resolvedConversations / conversationsTotal) * 100)
      : null;

  return NextResponse.json({
    tickets: { open: openTickets, urgent: urgentTickets, resolved_week: resolvedWeek },
    conversations: { today: conversationsToday, week: conversationsWeek, total: conversationsTotal },
    ai_performance: { resolution_rate: resolutionRate, escalated },
    satisfaction: { avg_rating: avgRating, total_reviews: totalReviews },
    knowledge_base: { total_articles: kbArticles },
    ai_memories: { total: memories },
  });
}
