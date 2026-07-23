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

// GET — List assignments with filters
export async function GET(req: NextRequest) {
    const user = await getAuthUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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
    const user = await getAuthUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { order_id, rider_id, priority, delivery_notes, estimated_delivery, delivery_fee } = body;

    if (!order_id || !rider_id) {
        return NextResponse.json({ error: 'order_id and rider_id are required' }, { status: 400 });
    }

    // Check if order is already assigned (active assignment)
    const { data: existing } = await supabaseAdmin
        .from('delivery_assignments')
        .select('id, status')
        .eq('order_id', order_id)
        .not('status', 'in', '("failed","returned")')
        .maybeSingle();

    if (existing) {
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
            assigned_by: user.id,
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
        changed_by: user.id,
        notes: `Assigned to ${rider.full_name}`,
    });

    return NextResponse.json({ assignment }, { status: 201 });
}

// PATCH — Update assignment status
export async function PATCH(req: NextRequest) {
    const user = await getAuthUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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

    if (orderStatusMap[status]) {
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
        changed_by: user.id,
        notes: delivery_notes || failure_reason || `Status changed to ${status}`,
    });

    return NextResponse.json({ assignment: updated });
}

// DELETE — Remove assignment
export async function DELETE(req: NextRequest) {
    const user = await getAuthUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    const { data: assignment } = await supabaseAdmin.from('delivery_assignments').select('order_id, status').eq('id', id).single();
    if (!assignment) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });

    if (['in_transit', 'delivered'].includes(assignment.status)) {
        return NextResponse.json({ error: 'Cannot delete an in-progress or completed delivery' }, { status: 400 });
    }

    await supabaseAdmin.from('delivery_assignments').delete().eq('id', id);

    // Revert order status
    await supabaseAdmin.from('orders').update({
        status: 'processing',
        updated_at: new Date().toISOString(),
    }).eq('id', assignment.order_id);

    return NextResponse.json({ success: true });
}
