import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

async function getAuthUser(req: NextRequest) {
    const token = req.cookies.get('sb-access-token')?.value;
    if (!token) return null;
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) return null;
    const { data: profile } = await supabaseAdmin.from('profiles').select('role, full_name').eq('id', user.id).single();
    if (!profile || (profile.role !== 'admin' && profile.role !== 'staff')) return null;
    return { ...user, role: profile.role, fullName: profile.full_name };
}

// GET /api/delivery — Stats & dashboard data
export async function GET(req: NextRequest) {
    const user = await getAuthUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action') || 'stats';

    try {
        if (action === 'stats') {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const todayISO = today.toISOString();

            const [assignmentsRes, ridersRes, todayAssignments, pendingOrders, zonesRes] = await Promise.all([
                supabaseAdmin.from('delivery_assignments').select('id, status', { count: 'exact' }),
                supabaseAdmin.from('riders').select('id, status', { count: 'exact' }),
                supabaseAdmin.from('delivery_assignments').select('id, status, delivery_fee').gte('assigned_at', todayISO),
                supabaseAdmin.from('orders')
                    .select('id', { count: 'exact' })
                    .in('status', ['processing', 'shipped'])
                    .not('id', 'in', `(${(await supabaseAdmin.from('delivery_assignments').select('order_id').not('status', 'in', '("failed","returned")')).data?.map(a => a.order_id).join(',') || '00000000-0000-0000-0000-000000000000'})`),
                supabaseAdmin.from('delivery_zones').select('id', { count: 'exact' }).eq('is_active', true),
            ]);

            const allAssignments = assignmentsRes.data || [];
            const allRiders = ridersRes.data || [];
            const todayData = todayAssignments.data || [];

            const stats = {
                totalAssignments: allAssignments.length,
                activeDeliveries: allAssignments.filter(a => ['assigned', 'picked_up', 'in_transit'].includes(a.status)).length,
                deliveredToday: todayData.filter(a => a.status === 'delivered').length,
                failedToday: todayData.filter(a => a.status === 'failed').length,
                totalRiders: allRiders.length,
                activeRiders: allRiders.filter(r => r.status === 'active').length,
                onDeliveryRiders: allRiders.filter(r => r.status === 'on_delivery').length,
                pendingOrders: pendingOrders.count || 0,
                activeZones: zonesRes.count || 0,
                todayRevenue: todayData.filter(a => a.status === 'delivered').reduce((sum, a) => sum + (a.delivery_fee || 0), 0),
            };

            return NextResponse.json({ stats });
        }

        if (action === 'recent') {
            const { data } = await supabaseAdmin
                .from('delivery_assignments')
                .select(`
                    *,
                    riders (id, full_name, phone, vehicle_type),
                    orders (id, order_number, email, phone, shipping_address, total, status, created_at)
                `)
                .order('assigned_at', { ascending: false })
                .limit(20);

            return NextResponse.json({ assignments: data || [] });
        }

        if (action === 'unassigned') {
            const { data: assignedOrderIds } = await supabaseAdmin
                .from('delivery_assignments')
                .select('order_id')
                .not('status', 'in', '("failed","returned")');

            const excludeIds = (assignedOrderIds || []).map(a => a.order_id);

            let query = supabaseAdmin
                .from('orders')
                .select('id, order_number, email, phone, shipping_address, shipping_method, total, status, created_at')
                .in('status', ['processing', 'shipped', 'dispatched_to_rider'])
                .order('created_at', { ascending: true });

            if (excludeIds.length > 0) {
                query = query.not('id', 'in', `(${excludeIds.join(',')})`);
            }

            const { data } = await query;
            return NextResponse.json({ orders: data || [] });
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

    } catch (err: any) {
        console.error('[Delivery API] Error:', err);
        return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
    }
}
