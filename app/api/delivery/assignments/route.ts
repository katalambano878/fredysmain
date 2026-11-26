import { NextRequest, NextResponse } from 'next/server';
import { denyUnlessPermission, requireAnyPermission } from '@/lib/admin-route-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

/** Deliveries that still hold the order: anything that has not failed or been returned. */
const ACTIVE_OR_DONE = ['assigned', 'picked_up', 'in_transit', 'delivered'];

/** The steps a delivery may move through. A delivered or returned delivery is final. */
const NEXT_STATUSES: Record<string, string[]> = {
    assigned: ['picked_up', 'in_transit', 'delivered', 'failed', 'returned'],
    picked_up: ['in_transit', 'delivered', 'failed', 'returned'],
    in_transit: ['delivered', 'failed', 'returned'],
    failed: ['assigned', 'picked_up', 'in_transit', 'returned'],
    delivered: [],
    returned: [],
};

// GET — List assignments with filters
export async function GET(req: NextRequest) {
    const denied = await denyUnlessPermission(req, ['delivery']);
    if (denied) return denied;

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const riderId = searchParams.get('rider_id');
    const dateFrom = searchParams.get('date_from');
    const dateTo = searchParams.get('date_to');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const offset = (page - 1) * limit;

    let query = supabaseAdmin
        .from('delivery_assignments')
        .select(`
            *,
            riders (id, full_name, phone, vehicle_type, status),
            orders (id, order_number, email, phone, shipping_address, shipping_method, total, status, created_at, metadata)
        `, { count: 'exact' })
        .order('assigned_at', { ascending: false })
        .range(offset, offset + limit - 1);

    if (status && status !== 'all') query = query.eq('status', status);
    if (riderId) query = query.eq('rider_id', riderId);
    if (dateFrom) query = query.gte('assigned_at', dateFrom);
    if (dateTo) query = query.lte('assigned_at', dateTo);

    const { data, count, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ assignments: data || [], total: count || 0, page, limit });
}

// POST — Create new assignment (assign order to rider)
export async function POST(req: NextRequest) {
    const actor = await requireAnyPermission(req, ['delivery']);
    if (actor instanceof NextResponse) return actor;

    const body = await req.json();
    const { order_id, rider_id, priority, delivery_notes, estimated_delivery, delivery_fee } = body;

    if (!order_id || !rider_id) {
        return NextResponse.json({ error: 'order_id and rider_id are required' }, { status: 400 });
    }

    // The order must still be one that can go out for delivery.
    const { data: order } = await supabaseAdmin.from('orders').select('id, status').eq('id', order_id).maybeSingle();
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    if (['cancelled', 'refunded', 'delivered'].includes(String(order.status))) {
        return NextResponse.json(
            { error: `This order is ${order.status}, so it cannot be sent out for delivery.` },
            { status: 409 }
        );
    }

    // Check if order is already assigned (a delivery that has not failed or been returned)
    const { data: existing } = await supabaseAdmin
        .from('delivery_assignments')
        .select('id, status')
        .eq('order_id', order_id)
        .in('status', ACTIVE_OR_DONE)
        .limit(1);

    if (existing && existing.length > 0) {
        return NextResponse.json({ error: 'This order already has an active delivery assignment' }, { status: 409 });
    }

    // Check rider is available
    const { data: rider } = await supabaseAdmin.from('riders').select('id, status, full_name').eq('id', rider_id).single();
    if (!rider) return NextResponse.json({ error: 'Rider not found' }, { status: 404 });
    if (rider.status === 'inactive' || rider.status === 'off_duty') {
        return NextResponse.json({ error: `Rider ${rider.full_name} is currently ${rider.status}` }, { status: 400 });
    }

    const { data: assignment, error } = await supabaseAdmin
        .from('delivery_assignments')
        .insert({
            order_id,
            rider_id,
            priority: priority || 'normal',
            delivery_notes: delivery_notes || null,
            estimated_delivery: estimated_delivery || null,
            delivery_fee: delivery_fee || 0,
            assigned_by: actor.userId,
            status: 'assigned',
        })
        .select()
        .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Update order status to dispatched_to_rider
    await supabaseAdmin.from('orders').update({
        status: 'dispatched_to_rider',
        updated_at: new Date().toISOString(),
    }).eq('id', order_id);

    // Log to delivery status history
    await supabaseAdmin.from('delivery_status_history').insert({
        assignment_id: assignment.id,
        new_status: 'assigned',
        changed_by: actor.userId,
        notes: `Assigned to ${rider.full_name}`,
    });

    return NextResponse.json({ assignment }, { status: 201 });
}

// PATCH — Update assignment status
export async function PATCH(req: NextRequest) {
    const actor = await requireAnyPermission(req, ['delivery']);
    if (actor instanceof NextResponse) return actor;

    const body = await req.json();
    const { id, status, delivery_notes, failure_reason, proof_of_delivery } = body;

    if (!id || !status) {
        return NextResponse.json({ error: 'id and status are required' }, { status: 400 });
    }

    const validStatuses = ['assigned', 'picked_up', 'in_transit', 'delivered', 'failed', 'returned'];
    if (!validStatuses.includes(status)) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    const { data: current } = await supabaseAdmin
        .from('delivery_assignments')
        .select('*, riders(full_name)')
        .eq('id', id)
        .single();

    if (!current) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });

    if (current.status !== status && !(NEXT_STATUSES[current.status] || []).includes(status)) {
        return NextResponse.json(
            { error: `A delivery that is ${String(current.status).replace(/_/g, ' ')} cannot be changed to ${status.replace(/_/g, ' ')}.` },
            { status: 409 }
        );
    }

    // A cancelled or refunded order must stay that way: its delivery can only be closed off.
    const { data: order } = await supabaseAdmin
        .from('orders')
        .select('id, status')
        .eq('id', current.order_id)
        .maybeSingle();
    const orderClosed = ['cancelled', 'refunded'].includes(String(order?.status));
    if (orderClosed && !['failed', 'returned'].includes(status)) {
        return NextResponse.json(
            { error: `This order was ${order?.status}. Mark the delivery as failed or returned instead.` },
            { status: 409 }
        );
    }

    const now = new Date().toISOString();
    const updateData: any = { status, updated_at: now };

    if (status === 'picked_up') updateData.picked_up_at = now;
    if (status === 'in_transit') updateData.in_transit_at = now;
    if (status === 'delivered') updateData.delivered_at = now;
    if (status === 'failed') {
        updateData.failed_at = now;
        updateData.failure_reason = failure_reason || null;
    }
    if (delivery_notes) updateData.delivery_notes = delivery_notes;
    if (proof_of_delivery) updateData.proof_of_delivery = proof_of_delivery;

    const { data: updated, error } = await supabaseAdmin
        .from('delivery_assignments')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Update corresponding order status
    const orderStatusMap: Record<string, string> = {
        delivered: 'delivered',
        failed: 'processing',
    };

    if (orderStatusMap[status] && !orderClosed) {
        await supabaseAdmin.from('orders').update({
            status: orderStatusMap[status],
            updated_at: now,
        }).eq('id', current.order_id);
    }

    // Log to history
    await supabaseAdmin.from('delivery_status_history').insert({
        assignment_id: id,
        old_status: current.status,
        new_status: status,
        changed_by: actor.userId,
        notes: delivery_notes || failure_reason || `Status changed to ${status}`,
    });

    return NextResponse.json({ assignment: updated });
}

// DELETE — Remove assignment
export async function DELETE(req: NextRequest) {
    const denied = await denyUnlessPermission(req, ['delivery']);
    if (denied) return denied;

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    const { data: assignment } = await supabaseAdmin.from('delivery_assignments').select('order_id, status').eq('id', id).single();
    if (!assignment) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });

    if (['in_transit', 'delivered'].includes(assignment.status)) {
        return NextResponse.json({ error: 'Cannot delete an in-progress or completed delivery' }, { status: 400 });
    }

    const { error: deleteError } = await supabaseAdmin.from('delivery_assignments').delete().eq('id', id);
    if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

    // Put the order back to "processing" only if it is still waiting on this delivery.
    // (An order that was cancelled in the meantime must stay cancelled.)
    await supabaseAdmin.from('orders').update({
        status: 'processing',
        updated_at: new Date().toISOString(),
    }).eq('id', assignment.order_id).eq('status', 'dispatched_to_rider');

    return NextResponse.json({ success: true });
}
