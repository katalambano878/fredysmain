import { NextRequest, NextResponse } from 'next/server';
import { denyUnlessPermission } from '@/lib/admin-route-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

// GET — List riders
export async function GET(req: NextRequest) {
    const denied = await denyUnlessPermission(req, ['delivery']);
    if (denied) return denied;

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');

    let query = supabaseAdmin
        .from('riders')
        .select(`*, delivery_zones (id, name)`)
        .order('created_at', { ascending: false });

    if (status && status !== 'all') query = query.eq('status', status);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ riders: data || [] });
}

// POST — Add new rider
export async function POST(req: NextRequest) {
    const denied = await denyUnlessPermission(req, ['delivery']);
    if (denied) return denied;

    const body = await req.json();
    const { full_name, phone, email, vehicle_type, license_plate, zone_id } = body;

    if (!full_name || !phone) {
        return NextResponse.json({ error: 'full_name and phone are required' }, { status: 400 });
    }

    const { data: existing } = await supabaseAdmin.from('riders').select('id').eq('phone', phone).maybeSingle();
    if (existing) {
        return NextResponse.json({ error: 'A rider with this phone number already exists' }, { status: 409 });
    }

    const { data, error } = await supabaseAdmin.from('riders').insert({
        full_name,
        phone,
        email: email || null,
        vehicle_type: vehicle_type || 'motorcycle',
        license_plate: license_plate || null,
        zone_id: zone_id || null,
        status: 'active',
    }).select().single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ rider: data }, { status: 201 });
}

// PATCH — Update rider
export async function PATCH(req: NextRequest) {
    const denied = await denyUnlessPermission(req, ['delivery']);
    if (denied) return denied;

    const body = await req.json();
    const { id, full_name, phone, email, vehicle_type, license_plate, zone_id, status } = body;

    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    const updateData: any = { updated_at: new Date().toISOString() };
    if (full_name !== undefined) updateData.full_name = full_name;
    if (phone !== undefined) updateData.phone = phone;
    if (email !== undefined) updateData.email = email || null;
    if (vehicle_type !== undefined) updateData.vehicle_type = vehicle_type;
    if (license_plate !== undefined) updateData.license_plate = license_plate || null;
    if (zone_id !== undefined) updateData.zone_id = zone_id || null;
    if (status !== undefined) updateData.status = status;

    const { data, error } = await supabaseAdmin.from('riders').update(updateData).eq('id', id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ rider: data });
}

// DELETE — Remove rider
export async function DELETE(req: NextRequest) {
    const denied = await denyUnlessPermission(req, ['delivery']);
    if (denied) return denied;

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    // Deleting a rider also deletes every delivery they ever did (and its history and fees).
    // A rider with any delivery on record is switched to inactive instead, and stays in the reports.
    const { data: history, error: historyError } = await supabaseAdmin
        .from('delivery_assignments')
        .select('id, status')
        .eq('rider_id', id)
        .limit(1000);
    if (historyError) return NextResponse.json({ error: historyError.message }, { status: 500 });

    const assignments = history || [];
    if (assignments.some((a: any) => ['assigned', 'picked_up', 'in_transit'].includes(a.status))) {
        return NextResponse.json(
            { error: 'This rider has deliveries in progress. Finish or reassign them first.' },
            { status: 400 }
        );
    }

    if (assignments.length > 0) {
        const { error: inactiveError } = await supabaseAdmin
            .from('riders')
            .update({ status: 'inactive', updated_at: new Date().toISOString() })
            .eq('id', id);
        if (inactiveError) return NextResponse.json({ error: inactiveError.message }, { status: 500 });
        return NextResponse.json({
            success: true,
            deactivated: true,
            message: 'This rider has past deliveries, so they were set to inactive instead of deleted. Their delivery history is kept.',
        });
    }

    const { error } = await supabaseAdmin.from('riders').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
}
