import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { denyUnlessPermission } from '@/lib/admin-route-auth';

export async function GET(request: Request) {
  // The list feeds Orders, Sales (the till's sales) and Preorders.
  const err = await denyUnlessPermission(request, ['orders', 'pos', 'preorders']);
  if (err) return err;

  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period');

    // Sales stats mode
    if (period !== null) {
      let startDate: string | null = null;
      const now = new Date();
      if (period === '24h') { const d = new Date(now); d.setHours(d.getHours() - 24); startDate = d.toISOString(); }
      else if (period === '7d') { const d = new Date(now); d.setDate(d.getDate() - 7); startDate = d.toISOString(); }
      else if (period === '30d') { const d = new Date(now); d.setDate(d.getDate() - 30); startDate = d.toISOString(); }

      let query = supabaseAdmin
        .from('order_items')
        .select(`quantity, product_name, product_id, variant_name, total_price, orders!inner(id, created_at, status, payment_status)`)
        .eq('orders.payment_status', 'paid')
        .neq('orders.status', 'cancelled');

      if (startDate) query = query.gte('orders.created_at', startDate);

      const { data, error } = await query;
      if (error) throw error;
      return NextResponse.json({ items: data || [] });
    }

    // Orders list — capped to protect pool + admin UI (default 300, max 1000)
    const preorderOnly = searchParams.get('preorder') === '1';
    const page = Math.max(1, Number(searchParams.get('page') || 1) || 1);
    const limit = Math.min(1000, Math.max(1, Number(searchParams.get('limit') || 300) || 300));
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let ordersQuery = supabaseAdmin
      .from('orders')
      .select(`
        id,
        order_number,
        email,
        total,
        status,
        payment_status,
        payment_method,
        shipping_method,
        created_at,
        phone,
        shipping_address,
        metadata,
        is_preorder,
        staff_id,
        packed_by,
        staff:profiles!orders_staff_id_fkey(full_name),
        packer:profiles!orders_packed_by_fkey(full_name),
        order_items (
          quantity,
          product_name,
          variant_name,
          is_preorder,
          metadata
        )
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (preorderOnly) {
      ordersQuery = ordersQuery.eq('is_preorder', true);
    }

    const { data: ordersData, error, count } = await ordersQuery;

    if (error) throw error;
    return NextResponse.json({
      orders: ordersData || [],
      page,
      limit,
      total: count ?? (ordersData || []).length,
      hasMore: typeof count === 'number' ? to + 1 < count : (ordersData || []).length === limit,
    });
  } catch (e: any) {
    console.error('Admin orders API error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
