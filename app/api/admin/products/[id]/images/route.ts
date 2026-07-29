import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { isPlainPostgres } from '@/lib/db/mode';

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
  if (!isPlainPostgres() && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 503 });
  }
  const token = getAccessToken(request);
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !user) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  const role = profile?.role != null ? String(profile.role) : '';
  if (role !== 'admin' && role !== 'staff') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return null;
}

/**
 * PUT /api/admin/products/[id]/images
 * Body: { images: Array<{ url: string, position: number, alt_text?: string, media_type?: string }>, productName: string }
 * Replaces all product_images for the product. Uses service role so it always succeeds for admins.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const err = await requireAdmin(request);
  if (err) return err;

  const { id: productId } = await params;
  if (!productId) {
    return NextResponse.json({ error: 'Missing product id' }, { status: 400 });
  }

  try {
    const body = await request.json();
    const images = Array.isArray(body?.images) ? body.images : [];
    const productName = typeof body?.productName === 'string' ? body.productName : '';

    await supabaseAdmin.from('product_images').delete().eq('product_id', productId);

    if (images.length > 0) {
      const rows = images.map((img: any, idx: number) => ({
        product_id: productId,
        url: typeof img.url === 'string' ? img.url : '',
        position: Number(img.position) ?? idx,
        alt_text: productName || (typeof img.alt_text === 'string' ? img.alt_text : null),
        media_type: img.media_type === 'video' ? 'video' : 'image',
      })).filter((r: any) => r.url);

      if (rows.length > 0) {
        const { error } = await supabaseAdmin.from('product_images').insert(rows);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to save images' }, { status: 500 });
  }
}
