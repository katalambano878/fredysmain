import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

async function getAuthUser(req: NextRequest) {
    const token = req.cookies.get('sb-access-token')?.value;
    if (!token) return null;
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) return null;
    const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
    if (!profile || (profile.role !== 'admin' && profile.role !== 'staff')) return null;
    return { ...user, role: profile.role };
}

// GET — List riders
export async function GET(req: NextRequest) {
    const user = await getAuthUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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
    const user = await getAuthUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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
    const user = await getAuthUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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
    const user = await getAuthUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    const { data: active } = await supabaseAdmin
        .from('delivery_assignments')
        .select('id')
        .eq('rider_id', id)
        .in('status', ['assigned', 'picked_up', 'in_transit'])
        .limit(1);

    if (active && active.length > 0) {
        return NextResponse.json({ error: 'Cannot delete a rider with active deliveries. Set them inactive first.' }, { status: 400 });
    }

    const { error } = await supabaseAdmin.from('riders').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
}
