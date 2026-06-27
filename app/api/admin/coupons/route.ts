import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

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

async function requireAdmin(request: Request): Promise<NextResponse | null> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 503 });
  }
  const token = getAccessToken(request);
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !user) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
  const { data: profile } = await supabaseAdmin
    .from('profiles').select('role').eq('id', user.id).single();
  const role = profile?.role != null ? String(profile.role) : '';
  if (role !== 'admin' && role !== 'staff') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return null;
}

export async function GET(request: Request) {
  const err = await requireAdmin(request);
  if (err) return err;

  const { data, error } = await supabaseAdmin
    .from('coupons')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ coupons: data });
}

export async function POST(request: NextRequest) {
  const err = await requireAdmin(request);
  if (err) return err;

  try {
    const body = await request.json();
    const { code, type, value, description, minimum_purchase, maximum_discount, usage_limit, per_user_limit, start_date, end_date, is_active } = body;

    if (!code || !type || value == null) {
      return NextResponse.json({ error: 'code, type, and value are required' }, { status: 400 });
    }

    const { data: existing } = await supabaseAdmin
      .from('coupons')
      .select('id')
      .eq('code', code.toUpperCase().trim())
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: 'A coupon with this code already exists' }, { status: 409 });
    }

    const { data, error } = await supabaseAdmin
      .from('coupons')
      .insert({
        code: code.toUpperCase().trim(),
        type,
        value: Number(value),
        description: description || null,
        minimum_purchase: Number(minimum_purchase) || 0,
        maximum_discount: maximum_discount ? Number(maximum_discount) : null,
        usage_limit: usage_limit ? Number(usage_limit) : null,
        per_user_limit: per_user_limit ? Number(per_user_limit) : 1,
        start_date: start_date || new Date().toISOString(),
        end_date: end_date || null,
        is_active: is_active !== false,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ coupon: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to create coupon' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const err = await requireAdmin(request);
  if (err) return err;

  try {
    const body = await request.json();
    const { id, ...updates } = body;
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    if (updates.code) updates.code = updates.code.toUpperCase().trim();
    if (updates.value != null) updates.value = Number(updates.value);
    if (updates.minimum_purchase != null) updates.minimum_purchase = Number(updates.minimum_purchase);
    if (updates.maximum_discount != null) updates.maximum_discount = Number(updates.maximum_discount) || null;
    if (updates.usage_limit != null) updates.usage_limit = Number(updates.usage_limit) || null;
    if (updates.per_user_limit != null) updates.per_user_limit = Number(updates.per_user_limit) || 1;
    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from('coupons')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ coupon: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to update coupon' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const err = await requireAdmin(request);
  if (err) return err;

  try {
    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    const { error } = await supabaseAdmin.from('coupons').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to delete coupon' }, { status: 500 });
  }
}
