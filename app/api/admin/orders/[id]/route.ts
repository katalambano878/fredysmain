import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { isPlainPostgres } from '@/lib/db/mode';
import { mergeOrderMetadata } from '@/lib/order-metadata';

function getAccessToken(request: Request): string | null {
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7).trim();
  const cookieHeader = request.headers.get('cookie') || '';
  const match = cookieHeader.match(/\bsb-access-token=([^;]+)/);
  if (match) return decodeURIComponent(match[1].trim());
  const authCookie = cookieHeader
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith('sb-') && (c.includes('-auth-token') || c.includes('auth')));
  if (!authCookie) return null;
  const value = authCookie.split('=').slice(1).join('=').trim();
  const decoded = decodeURIComponent(value);
  try {
    const parsed = JSON.parse(decoded);
    if (Array.isArray(parsed) && parsed[0]) return parsed[0];
    if (parsed?.access_token) return parsed.access_token;
    if (typeof parsed === 'string') return parsed;
  } catch {
    return decoded;
  }
  return null;
}

async function requireAdminOrStaff(request: Request): Promise<{ error: NextResponse } | { userId: string }> {
  if (!isPlainPostgres() && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { error: NextResponse.json({ error: 'Server misconfiguration' }, { status: 503 }) };
  }
  const token = getAccessToken(request);
  if (!token) return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) };
  const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !user) return { error: NextResponse.json({ error: 'Invalid session' }, { status: 401 }) };
  const { data: profile } = await supabaseAdmin
    .from('profiles').select('role').eq('id', user.id).single();
  const role = profile?.role != null ? String(profile.role) : '';
  if (role !== 'admin' && role !== 'staff') {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { userId: user.id };
}

const ORDER_SELECT = `
  *,
  staff:profiles!orders_staff_id_fkey(full_name),
  packer:profiles!orders_packed_by_fkey(full_name),
  order_items (
    id,
    product_id,
    product_name,
    variant_name,
    sku,
    quantity,
    unit_price,
    total_price,
    is_preorder,
    metadata,
    products (
      product_images (url)
    )
  )
`;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminOrStaff(request);
  if ('error' in auth) return auth.error;

  const { id } = await params;

  try {
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    let data: any = null;

    if (isUUID) {
      const { data: d, error } = await supabaseAdmin
        .from('orders').select(ORDER_SELECT).eq('id', id).single();
      if (!error) data = d;
    }

    if (!data) {
      const { data: d, error } = await supabaseAdmin
        .from('orders').select(ORDER_SELECT).eq('order_number', id).single();
      if (error) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
      data = d;
    }

    return NextResponse.json({ order: data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminOrStaff(request);
  if ('error' in auth) return auth.error;

  const { id } = await params;

  try {
    const body = await request.json();
    const { status, notes, metadata, mark_packed } = body;

    // Only what was actually sent is changed. A status-only update (the bulk action) used to
    // blank the order's notes and wipe its payment details.
    const updatePayload: Record<string, unknown> = {};
    if (typeof status === 'string' && status) updatePayload.status = status;
    if (typeof notes === 'string') updatePayload.notes = notes;
    if (mark_packed) updatePayload.packed_by = auth.userId;

    if (Object.keys(updatePayload).length > 0) {
      const { error } = await supabaseAdmin.from('orders').update(updatePayload).eq('id', id);
      if (error) throw error;
    }

    // A cancelled order gives its stock back (once: the database function clears its own flag).
    let stockRestored = false;
    if (updatePayload.status === 'cancelled') {
      const { data: restored, error: restoreError } = await supabaseAdmin.rpc('restore_order_stock', {
        p_order_id: id,
      });
      if (restoreError) console.error('[orders] restore_order_stock failed:', restoreError.message);
      stockRestored = restored === true;
    }

    // Metadata is added to what is stored, never swapped for the copy the browser had.
    if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
      // Keys the payment and stock code own are not taken from the browser's (possibly old) copy.
      const serverOwned = new Set([
        'stock_reduced',
        'stock_restored_at',
        'payment_verified_at',
        'moolre_reference',
        'hubtel_client_reference',
        'hubtel_balance_reference',
        'coupon_code',
        'server_priced',
      ]);
      const safeMetadata = Object.fromEntries(
        Object.entries(metadata as Record<string, unknown>).filter(([key]) => !serverOwned.has(key))
      );
      if (Object.keys(safeMetadata).length > 0) {
        const { error: metadataError } = await mergeOrderMetadata({ id }, safeMetadata);
        if (metadataError) throw new Error(metadataError);
      }
    }

    if (mark_packed) {
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('full_name')
        .eq('id', auth.userId)
        .single();
      return NextResponse.json({ success: true, packed_by_name: profile?.full_name || null });
    }

    return NextResponse.json({ success: true, stockRestored });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
