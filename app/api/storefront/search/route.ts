import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim();
  if (!q || q.length < 2) {
    return NextResponse.json({ products: [], categories: [] });
  }

  const pattern = `%${q}%`;

  const [productsRes, categoriesRes] = await Promise.all([
    supabaseAdmin
      .from('products')
      .select(`
        id, name, slug, price, compare_at_price,
        product_images(url, position),
        categories(name)
      `)
      .eq('status', 'active')
      .ilike('name', pattern)
      .order('created_at', { ascending: false })
      .limit(6),
    supabaseAdmin
      .from('categories')
      .select('id, name, slug')
      .ilike('name', pattern)
      .limit(4),
  ]);

  const products = (productsRes.data || []).map((p: any) => {
    const images = Array.isArray(p.product_images) ? [...p.product_images] : [];
    images.sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0));
    return {
      id: p.id,
      name: p.name,
      slug: p.slug,
      price: p.price,
      compare_at_price: p.compare_at_price,
      category: p.categories?.name || '',
      image: images[0]?.url || '',
    };
  });

  const categories = (categoriesRes.data || []).map((c: any) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
  }));

  return NextResponse.json({ products, categories });
}
