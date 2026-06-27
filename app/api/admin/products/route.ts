import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { syncProductCostOfProduction } from '@/lib/product-cop';

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

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

async function requireAdmin(request: Request): Promise<{ error: NextResponse } | { userId: string }> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { error: NextResponse.json({ error: 'Server misconfiguration' }, { status: 503 }) };
  }
  const token = getAccessToken(request);
  if (!token) return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) };
  const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !user) return { error: NextResponse.json({ error: 'Invalid session' }, { status: 401 }) };
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  const role = profile?.role != null ? String(profile.role) : '';
  if (role !== 'admin' && role !== 'staff') {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { userId: user.id };
}

const PLACEHOLDER_IMAGE = 'https://via.placeholder.com/300?text=No+Image';

/**
 * GET /api/admin/products
 * Returns products with product_images (and categories, variant count) using service role.
 * Use this in the admin products list so images always load regardless of RLS.
 */
export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ('error' in auth) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const sortBy = searchParams.get('sortBy') || 'newest';

    let query = supabaseAdmin
      .from('products')
      .select(`
        *,
        categories(name),
        product_variants(count),
        product_images(url, position),
        created_by_profile:profiles!products_created_by_fkey(full_name)
      `);

    if (sortBy === 'newest') query = query.order('created_at', { ascending: false });
    if (sortBy === 'price_asc') query = query.order('price', { ascending: true });
    if (sortBy === 'price_desc') query = query.order('price', { ascending: false });
    if (sortBy === 'name') query = query.order('name', { ascending: true });
    if (sortBy === 'stock') query = query.order('quantity', { ascending: true });

    const { data, error } = await query;

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const products = (data || []).map((p: any) => {
      const images = Array.isArray(p.product_images) ? [...p.product_images] : [];
      images.sort((a: any, b: any) => (Number(a.position) ?? 0) - (Number(b.position) ?? 0));
      const firstImageUrl = images.find((img: any) => Number(img.position) === 0)?.url
        || images[0]?.url
        || PLACEHOLDER_IMAGE;

      return {
        ...p,
        category: p.categories?.name || 'Uncategorized',
        image: firstImageUrl,
        product_images: images,
        variantsCount: p.product_variants?.[0]?.count || 0,
        stock: p.quantity,
        sales: 0,
        rating: p.rating_avg || 0,
        added_by: p.created_by_profile?.full_name || null,
      };
    });

    return NextResponse.json(products);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to fetch products' }, { status: 500 });
  }
}

/**
 * POST /api/admin/products
 * Creates a new product + variants using the service role (bypasses RLS).
 * Handles duplicate slug by appending a numeric suffix.
 */
export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ('error' in auth) return auth.error;

  try {
    const body = await request.json();
    const { variants = [], cop, ...productData } = body;
    productData.created_by = auth.userId;

    // Ensure slug is unique
    let slug: string = productData.slug || productData.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
    let slugCandidate = slug;
    let attempt = 1;
    while (true) {
      const { data: existing } = await supabaseAdmin
        .from('products')
        .select('id')
        .eq('slug', slugCandidate)
        .maybeSingle();
      if (!existing) break;
      attempt++;
      slugCandidate = `${slug}-${attempt}`;
    }
    productData.slug = slugCandidate;

    const { data: newProduct, error: insertError } = await supabaseAdmin
      .from('products')
      .insert([productData])
      .select()
      .single();

    if (insertError || !newProduct) {
      return NextResponse.json({ error: insertError?.message || 'Failed to create product' }, { status: 500 });
    }

    try {
      await syncProductCostOfProduction(newProduct.id, cop);
    } catch (copErr: any) {
      return NextResponse.json({ error: copErr?.message || 'Failed to save cost of production' }, { status: 500 });
    }

    // Insert variants if any
    if (variants.length > 0) {
      const variantInserts = variants.map((v: any, idx: number) => ({
        product_id: newProduct.id,
        name: v.name || v.color || 'Default',
        sku: v.sku || null,
        price: parseFloat(v.price) || 0,
        quantity: parseInt(v.stock) || 0,
        option1: v.name || null,
        option2: v.color?.trim() || null,
        image_url: v.image_url?.trim() || null,
        sort_order: v.sort_order ?? idx,
        metadata: v.colorHex ? { color_hex: v.colorHex } : {},
      }));
      // Insert in chunks of 100 to avoid payload limits
      const CHUNK = 100;
      for (let i = 0; i < variantInserts.length; i += CHUNK) {
        const chunk = variantInserts.slice(i, i + CHUNK);
        const { error: varError } = await supabaseAdmin.from('product_variants').insert(chunk);
        if (varError) {
          return NextResponse.json({ error: varError.message }, { status: 500 });
        }
      }
    }

    return NextResponse.json({ id: newProduct.id, slug: newProduct.slug });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to create product' }, { status: 500 });
  }
}
