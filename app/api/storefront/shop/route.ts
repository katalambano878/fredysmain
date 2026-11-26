import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { isPlainPostgres } from '@/lib/db/mode';

export const dynamic = 'force-dynamic';

const SEARCH_STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'that',
  'this',
  'these',
  'those',
  'tool',
  'tools',
  'product',
  'products',
  'item',
  'items',
]);

const PAGE = 500;
const MAX_PRODUCTS = 5000;
const CACHE_MS = 30_000;
const NO_PRICE_CAP = 5000;

type Catalogue = { products: any[]; categories: any[] };
let cache: { at: number; value: Catalogue } | null = null;
let loading: Promise<Catalogue> | null = null;

/**
 * Every active product with its sizes. Most outfits keep their price on the size, not on the
 * product, so sorting or filtering by price in SQL sorted a column full of zeros. The shop is
 * a few hundred products: it is loaded once, kept for 30 seconds, and filtered here.
 */
async function loadCatalogue(): Promise<Catalogue> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  if (loading) return loading;

  loading = (async () => {
    const products: any[] = [];
    for (let from = 0; from < MAX_PRODUCTS; from += PAGE) {
      const { data, error } = await supabaseAdmin
        .from('products')
        .select(
          `
          id, name, slug, price, compare_at_price, quantity, moq, rating_avg, review_count, status, created_at,
          categories(id, name, slug, parent_id),
          product_images(url, position),
          product_variants(id, name, price, compare_at_price, quantity, option1, option2)
        `
        )
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      products.push(...(data || []));
      if (!data || data.length < PAGE) break;
    }

    const { data: categories, error: categoryError } = await supabaseAdmin
      .from('categories')
      .select('id, name, slug, parent_id')
      .eq('status', 'active');
    if (categoryError) throw new Error(categoryError.message);

    for (const p of products) {
      if (Array.isArray(p.product_images)) {
        p.product_images = [...p.product_images].sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0));
      }
    }

    const value = { products, categories: categories || [] };
    cache = { at: Date.now(), value };
    return value;
  })();

  try {
    return await loading;
  } finally {
    loading = null;
  }
}

function wholeNumber(raw: string | null, fallback: number): number {
  const n = Number.parseInt(raw || '', 10);
  return Number.isFinite(n) ? n : fallback;
}

/** What a shopper pays at the least: the cheapest priced size, or the product's own price. */
function lowestPrice(p: any): number {
  const prices = (p.product_variants || []).map((v: any) => Number(v.price)).filter((n: number) => n > 0);
  if (prices.length) return Math.min(...prices);
  return Number(p.price) > 0 ? Number(p.price) : 0;
}

/** "Age 4", "age4" and "4" are the same size; so are "6 months", "6months" and "6m". */
function sizeKey(raw: unknown): string {
  let key = String(raw ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
  if (key.startsWith('age')) key = key.slice(3);
  key = key.replace(/^(\d+)(m|mo|mth|mths|month|months)$/, '$1m');
  key = key.replace(/^(\d+)(y|yr|yrs|year|years)$/, '$1');
  return key;
}

/** A category's slug plus the slugs of everything filed under it, however deep. */
function withChildren(slugs: string[], categories: any[]): Set<string> {
  const wanted = new Set(slugs);
  const ids = new Set(categories.filter((c) => wanted.has(c.slug)).map((c) => c.id));
  let grew = true;
  while (grew) {
    grew = false;
    for (const c of categories) {
      if (c.parent_id && ids.has(c.parent_id) && !ids.has(c.id)) {
        ids.add(c.id);
        grew = true;
      }
    }
  }
  for (const c of categories) {
    if (ids.has(c.id) && c.slug) wanted.add(c.slug);
  }
  return wanted;
}

/**
 * GET /api/storefront/shop
 * Query params: search, categorySlugs (comma-separated or 'all'), priceMin, priceMax, rating,
 * sortBy, age, page, limit. Returns { data, count }.
 */
export async function GET(request: Request) {
  if (!isPlainPostgres() && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const search = (searchParams.get('search') || '').trim().toLowerCase();
  const categoryParam = searchParams.get('categorySlugs') || 'all';
  const priceMin = Math.max(0, wholeNumber(searchParams.get('priceMin'), 0));
  const priceMax = Math.max(0, wholeNumber(searchParams.get('priceMax'), NO_PRICE_CAP));
  const rating = Math.max(0, wholeNumber(searchParams.get('rating'), 0));
  const sortBy = searchParams.get('sortBy') || 'popular';
  const age = sizeKey(searchParams.get('age'));
  const page = Math.max(1, wholeNumber(searchParams.get('page'), 1));
  const limit = Math.min(100, Math.max(1, wholeNumber(searchParams.get('limit'), 9)));
  const requestedSlugs =
    categoryParam !== 'all'
      ? categoryParam
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

  try {
    const { products, categories } = await loadCatalogue();

    const matches = (categorySlugs: Set<string> | null, nameSearch: string) =>
      products.filter((p) => {
        if (nameSearch && !String(p.name || '').toLowerCase().includes(nameSearch)) return false;
        if (categorySlugs && !categorySlugs.has(p.categories?.slug)) return false;
        if (rating > 0 && !(Number(p.rating_avg) >= rating)) return false;
        if (priceMin > 0 || priceMax < NO_PRICE_CAP) {
          const price = lowestPrice(p);
          if (!(price > 0) || price < priceMin || price > priceMax) return false;
        }
        if (age) {
          // A size counts when it is that age and there is one to buy now.
          const sizes = p.product_variants || [];
          const hasSize = sizes.some(
            (v: any) => (Number(v.quantity) || 0) > 0 && (sizeKey(v.name) === age || sizeKey(v.option1) === age)
          );
          if (!hasSize) return false;
        }
        return true;
      });

    const categorySlugs = requestedSlugs.length ? withChildren(requestedSlugs, categories) : null;
    let found = matches(categorySlugs, search);
    let searchFallback: string | undefined;

    // Nothing is named like the search: try it as a category ("church" finds Church Wear).
    if (found.length === 0 && search && !categorySlugs) {
      const terms = Array.from(
        new Set(search.split(/[^a-z0-9]+/).filter((term) => term.length >= 3 && !SEARCH_STOP_WORDS.has(term)))
      );
      if (terms.length > 0) {
        const scored = categories
          .map((category: any) => {
            const name = String(category.name || '').toLowerCase();
            const slug = String(category.slug || '').toLowerCase();
            let score = name.includes(search) || slug.includes(search) ? 6 : 0;
            for (const term of terms) {
              if (name === term || slug === term) score += 4;
              else if (`${name} ${slug}`.includes(term)) score += 2;
            }
            return { slug: category.slug as string, score };
          })
          .filter((row: { slug: string; score: number }) => row.score > 0 && row.slug);
        if (scored.length > 0) {
          const fallback = matches(withChildren(scored.map((row: { slug: string }) => row.slug), categories), '');
          if (fallback.length > 0) {
            found = fallback;
            searchFallback = 'category';
          }
        }
      }
    }

    const byNewest = (a: any, b: any) => String(b.created_at || '').localeCompare(String(a.created_at || ''));
    const sorted = [...found];
    if (sortBy === 'price-low' || sortBy === 'price-high') {
      const direction = sortBy === 'price-low' ? 1 : -1;
      sorted.sort((a, b) => {
        const pa = lowestPrice(a);
        const pb = lowestPrice(b);
        // An outfit with no price yet goes last either way.
        if (!(pa > 0) || !(pb > 0)) return (pb > 0 ? 1 : 0) - (pa > 0 ? 1 : 0) || byNewest(a, b);
        return (pa - pb) * direction || byNewest(a, b);
      });
    } else if (sortBy === 'rating') {
      sorted.sort((a, b) => (Number(b.rating_avg) || 0) - (Number(a.rating_avg) || 0) || byNewest(a, b));
    }

    const start = (page - 1) * limit;
    return NextResponse.json(
      {
        data: sorted.slice(start, start + limit),
        count: sorted.length,
        ...(searchFallback ? { searchFallback } : {}),
      },
      { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' } }
    );
  } catch (e) {
    console.error('[Storefront Shop API] Error:', e);
    return NextResponse.json({ error: 'Could not load products' }, { status: 500 });
  }
}
