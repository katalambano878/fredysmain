'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import PageHero from '@/components/PageHero';
import ProductCard, { getColorHex, type ColorVariant } from '@/components/ProductCard';
import ProductCardSkeleton from '@/components/skeletons/ProductCardSkeleton';
import { usePageTitle } from '@/hooks/usePageTitle';
import { HERO_IMAGES } from '@/lib/hero-images';

const PRODUCT_GRID = 'grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5 sm:gap-4';

type SaleCard = {
  id: string;
  slug: string;
  name: string;
  price: number;
  originalPrice?: number;
  image: string;
  rating: number;
  inStock: boolean;
  maxStock: number;
  moq: number;
  hasVariants: boolean;
  minVariantPrice?: number;
  colorVariants: ColorVariant[];
};

/** Same card shape as the shop page, so a product looks the same in both places. */
function toCard(p: any): SaleCard {
  const variants: any[] = p.product_variants || [];
  const hasVariants = variants.length > 0;
  const pricedVariants = variants.filter((v) => Number(v.price) > 0);
  const minVariantPrice = pricedVariants.length ? Math.min(...pricedVariants.map((v) => Number(v.price))) : undefined;
  const cheapestOnSale = pricedVariants
    .filter((v) => Number(v.compare_at_price) > Number(v.price))
    .sort((a, b) => Number(a.price) - Number(b.price))[0];
  const productOnSale = Number(p.compare_at_price) > Number(p.price) && Number(p.price) > 0;
  const originalPrice = productOnSale
    ? Number(p.compare_at_price)
    : cheapestOnSale
      ? Number(cheapestOnSale.compare_at_price)
      : undefined;
  const stock = hasVariants ? variants.reduce((sum, v) => sum + (v.quantity || 0), 0) : p.quantity;

  const colorVariants: ColorVariant[] = [];
  const seen = new Set<string>();
  for (const v of variants) {
    const name = String(v.option2 || '').trim();
    const hex = name ? getColorHex(name) : null;
    if (name && hex && !seen.has(name.toLowerCase())) {
      seen.add(name.toLowerCase());
      colorVariants.push({ name, hex });
    }
  }
  const images = [...(p.product_images || [])].sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0));
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    price: p.price,
    originalPrice,
    image: images[0]?.url || '/frebys-logo.png',
    rating: p.rating_avg || 0,
    inStock: stock > 0,
    maxStock: stock || 50,
    moq: p.moq || 1,
    hasVariants,
    minVariantPrice,
    colorVariants,
  };
}

export default function SalePage() {
  usePageTitle('Sale');
  const [products, setProducts] = useState<SaleCard[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    setProducts(null);
    fetch('/api/storefront/sale')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('failed'))))
      .then((json) => {
        if (!cancelled) setProducts((json.products || []).map(toCard));
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  return (
    <div className="min-h-screen bg-white">
      <PageHero
        title="Sale"
        subtitle="Kids outfits at lower prices, while the sale lasts"
        image={HERO_IMAGES.shop}
        imagePosition="50% 30%"
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {failed ? (
          <div className="py-16 text-center">
            <p className="text-lg font-medium text-gray-900">The sale could not load.</p>
            <p className="mt-1 text-gray-600">Check your connection and try again.</p>
            <button
              onClick={() => setAttempt((n) => n + 1)}
              className="mt-5 inline-block rounded-xl bg-gray-900 px-6 py-3 text-sm font-semibold text-white hover:bg-gray-800 transition-colors"
            >
              Try again
            </button>
          </div>
        ) : products === null ? (
          <div className={PRODUCT_GRID} aria-busy="true" aria-label="Loading sale products">
            {Array.from({ length: 8 }).map((_, i) => (
              <ProductCardSkeleton key={i} />
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-lg font-medium text-gray-900">Nothing is on sale right now.</p>
            <p className="mt-1 text-gray-600">Sale prices show here as soon as they start.</p>
            <Link
              href="/shop"
              className="mt-5 inline-block rounded-xl bg-gray-900 px-6 py-3 text-sm font-semibold text-white hover:bg-gray-800 transition-colors"
            >
              Shop all outfits
            </Link>
          </div>
        ) : (
          <>
            <p className="mb-6 text-sm text-gray-600">
              {products.length} outfit{products.length === 1 ? '' : 's'} on sale
            </p>
            <div className={PRODUCT_GRID}>
              {products.map((p) => (
                <ProductCard key={p.id} {...p} badge="Sale" />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
