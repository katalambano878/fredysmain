import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

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
        product_variants(price, compare_at_price),
        categories(name)
      `)
      .eq('status', 'active')
      .ilike('name', pattern)
      .order('created_at', { ascending: false })
      .limit(6),
    supabaseAdmin
      .from('categories')
      .select('id, name, slug')
      .eq('status', 'active')
      .ilike('name', pattern)
      .limit(4),
  ]);

  const products = (productsRes.data || []).map((p: any) => {
    const images = Array.isArray(p.product_images) ? [...p.product_images] : [];
    images.sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0));
    // Most outfits are priced per size, so the product's own price is 0: show the lowest size price.
    const sizes = (Array.isArray(p.product_variants) ? p.product_variants : []).filter((v: any) => Number(v.price) > 0);
    const cheapest = [...sizes].sort((a: any, b: any) => Number(a.price) - Number(b.price))[0];
    const price = cheapest ? Number(cheapest.price) : Number(p.price) || 0;
    const compareAt = cheapest ? cheapest.compare_at_price : p.compare_at_price;
    return {
      id: p.id,
      name: p.name,
      slug: p.slug,
      price,
      compare_at_price: Number(compareAt) > price ? Number(compareAt) : null,
      /** True when sizes have different prices, so the price shown is the lowest. */
      price_is_from: new Set(sizes.map((v: any) => Number(v.price))).size > 1,
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
