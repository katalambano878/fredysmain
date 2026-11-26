import { NextRequest, NextResponse } from 'next/server';
import { accraDay } from '@/app/api/admin/_lib/accra-day';
import { denyUnlessPermission } from '@/lib/admin-route-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * Orders waiting for a rider: paid for, to be delivered to the door, and not already with a rider.
 * Store-pickup orders never need a rider. The list and its count both come from here, so they agree.
 */
async function awaitingDispatch(): Promise<any[]> {
    const { data: held, error: heldError } = await supabaseAdmin
        .from('delivery_assignments')
        .select('order_id')
        .in('status', ['assigned', 'picked_up', 'in_transit', 'delivered']);
    if (heldError) throw new Error(heldError.message);
    const taken = new Set((held || []).map((a: any) => a.order_id));

    const { data: orders, error } = await supabaseAdmin
        .from('orders')
        .select('id, order_number, email, phone, shipping_address, shipping_method, total, status, payment_status, created_at')
        .in('status', ['processing', 'shipped', 'dispatched_to_rider'])
        .order('created_at', { ascending: true })
        .limit(1000);
    if (error) throw new Error(error.message);

    return (orders || []).filter(
        (o: any) => !taken.has(o.id) && String(o.shipping_method || '').toLowerCase() !== 'pickup'
    );
}

// GET /api/delivery — Stats & dashboard data
export async function GET(req: NextRequest) {
    const denied = await denyUnlessPermission(req, ['delivery']);
    if (denied) return denied;

    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action') || 'stats';

    try {
        if (action === 'stats') {
            // "Today" is the day in Accra, not the server's own midnight.
            const todayISO = accraDay().start;

            const [assignmentsRes, ridersRes, deliveredToday, failedToday, waiting, zonesRes] = await Promise.all([
                supabaseAdmin.from('delivery_assignments').select('id, status', { count: 'exact' }),
                supabaseAdmin.from('riders').select('id, status', { count: 'exact' }),
                // "Today" means the day the parcel was handed over or failed, not the day it was assigned.
                supabaseAdmin.from('delivery_assignments').select('id, delivery_fee').eq('status', 'delivered').gte('delivered_at', todayISO),
                supabaseAdmin.from('delivery_assignments').select('id').eq('status', 'failed').gte('failed_at', todayISO),
                awaitingDispatch(),
                supabaseAdmin.from('delivery_zones').select('id', { count: 'exact' }).eq('is_active', true),
            ]);

            for (const res of [assignmentsRes, ridersRes, deliveredToday, failedToday, zonesRes]) {
                if (res.error) throw new Error(res.error.message);
            }

            const allAssignments = assignmentsRes.data || [];
            const allRiders = ridersRes.data || [];
            const delivered = deliveredToday.data || [];

            // A rider is out on delivery when they hold a delivery that is still in progress.
            const busyRiders = new Set(
                (await supabaseAdmin
                    .from('delivery_assignments')
                    .select('rider_id')
                    .in('status', ['assigned', 'picked_up', 'in_transit'])).data?.map((a: any) => a.rider_id) || []
            );

            const stats = {
                totalAssignments: allAssignments.length,
                activeDeliveries: allAssignments.filter((a: any) => ['assigned', 'picked_up', 'in_transit'].includes(a.status)).length,
                deliveredToday: delivered.length,
                failedToday: (failedToday.data || []).length,
                totalRiders: allRiders.length,
                activeRiders: allRiders.filter((r: any) => r.status === 'active').length,
                onDeliveryRiders: allRiders.filter((r: any) => busyRiders.has(r.id)).length,
                pendingOrders: waiting.length,
                activeZones: zonesRes.count || 0,
                todayRevenue: delivered.reduce((sum: number, a: any) => sum + (Number(a.delivery_fee) || 0), 0),
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
            return NextResponse.json({ orders: await awaitingDispatch() });
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

    } catch (err: any) {
        console.error('[Delivery API] Error:', err);
        return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
    }
}
