'use client';

import { useState } from 'react';
import Link from 'next/link';
import LazyImage from './LazyImage';
import { useCart } from '@/context/CartContext';
import { asNumber, moneyLabel } from '@/lib/format-money';

// Map common color names to hex values for swatches
const COLOR_MAP: Record<string, string> = {
  black: '#000000', white: '#FFFFFF', red: '#EF4444', blue: '#3B82F6',
  navy: '#1E3A5F', green: '#22C55E', yellow: '#EAB308', orange: '#F97316',
  pink: '#EC4899', purple: '#A855F7', brown: '#92400E', beige: '#D4C5A9',
  grey: '#6B7280', gray: '#6B7280', cream: '#FFFDD0', teal: '#14B8A6',
  maroon: '#800000', coral: '#FF7F50', burgundy: '#800020', olive: '#808000',
  tan: '#D2B48C', khaki: '#C3B091', charcoal: '#36454F', ivory: '#FFFFF0',
  gold: '#FFD700', silver: '#C0C0C0', rose: '#FF007F', lavender: '#E6E6FA',
  mint: '#98FB98', peach: '#FFDAB9', wine: '#722F37', denim: '#1560BD',
  nude: '#E3BC9A', camel: '#C19A6B', sage: '#BCB88A', rust: '#B7410E',
  mustard: '#FFDB58', plum: '#8E4585', lilac: '#C8A2C8', stone: '#928E85',
  sand: '#C2B280', taupe: '#483C32', mauve: '#E0B0FF', sky: '#87CEEB',
  forest: '#228B22', cobalt: '#0047AB', emerald: '#50C878', scarlet: '#FF2400',
  aqua: '#00FFFF', turquoise: '#40E0D0', indigo: '#4B0082', crimson: '#DC143C',
  magenta: '#FF00FF', cyan: '#00FFFF', chocolate: '#7B3F00', coffee: '#6F4E37',
};

export function getColorHex(colorName: string): string | null {
  const lower = colorName.toLowerCase().trim();
  if (COLOR_MAP[lower]) return COLOR_MAP[lower];
  for (const [key, val] of Object.entries(COLOR_MAP)) {
    if (lower.includes(key)) return val;
  }
  return null;
}

export interface ColorVariant {
  name: string;
  hex: string;
}

interface ProductCardProps {
  id: string;
  slug: string;
  name: string;
  price: number;
  originalPrice?: number;
  image: string;
  rating?: number;
  reviewCount?: number;
  badge?: string;
  inStock?: boolean;
  maxStock?: number;
  moq?: number;
  hasVariants?: boolean;
  minVariantPrice?: number;
  colorVariants?: ColorVariant[];
}

export default function ProductCard({
  id,
  slug,
  name,
  price,
  originalPrice,
  image,
  rating = 0,
  reviewCount = 0,
  badge,
  inStock = true,
  maxStock = 50,
  moq = 1,
  hasVariants = false,
  minVariantPrice,
  colorVariants = []
}: ProductCardProps) {
  const { addToCart } = useCart();
  const [activeColor, setActiveColor] = useState<string | null>(null);
  const displayPrice = hasVariants && minVariantPrice ? minVariantPrice : price;
  const discount = originalPrice
    ? Math.round((1 - asNumber(displayPrice) / asNumber(originalPrice)) * 100)
    : 0;
  const MAX_SWATCHES = 4;
  const ratingSafe = asNumber(rating, 0);

  return (
    <article className="group flex h-full w-full flex-col overflow-hidden rounded-xl border border-black/5 bg-white shadow-sm transition-shadow duration-200 hover:shadow-md sm:rounded-2xl">
      <Link
        href={`/product/${slug}`}
        className="relative block aspect-[3/4] overflow-hidden bg-gray-100"
      >
        <LazyImage
          src={image}
          alt={name}
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          className="h-full w-full object-cover object-top transition-transform duration-500 group-hover:scale-[1.03]"
        />

        <div className="absolute left-1.5 top-1.5 flex max-w-[85%] flex-wrap items-center gap-1 sm:left-2.5 sm:top-2.5 sm:gap-1.5">
          {badge && (
            <span className="rounded-full bg-white/95 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-gray-800 shadow-sm sm:px-2 sm:text-[10px]">
              {badge}
            </span>
          )}
          {discount > 0 && (
            <span className="rounded-full bg-brand-orange px-1.5 py-0.5 text-[9px] font-semibold text-white shadow-sm sm:px-2 sm:text-[10px]">
              -{discount}%
            </span>
          )}
        </div>

        {/* Nothing on the shelf does not mean unavailable: the shop makes these to order. */}
        {!inStock && (
          <span className="absolute bottom-1.5 left-1.5 rounded-full bg-gray-900 px-2.5 py-1 text-[10px] font-semibold text-white sm:bottom-2.5 sm:left-2.5 sm:text-xs">
            Preorder
          </span>
        )}
      </Link>

      <div className="flex flex-1 flex-col p-2 sm:p-3">
        <div className="mb-1 flex items-center justify-between gap-1 text-[10px] sm:mb-1.5 sm:text-xs">
          <span
            className={`inline-flex items-center rounded-full px-1.5 py-0.5 font-medium sm:px-2 ${
              inStock ? 'bg-brand-greenLight text-brand-greenDark' : 'bg-amber-50 text-amber-800'
            }`}
          >
            {inStock ? 'In stock' : 'Made to order'}
          </span>
          {/* A star rating only when shoppers have actually reviewed the outfit. */}
          {reviewCount > 0 && ratingSafe > 0 && (
            <div className="inline-flex items-center gap-0.5 text-gray-600" aria-label={`Rated ${ratingSafe.toFixed(1)} out of 5`}>
              <i className="ri-star-fill text-[10px] text-brand-orange sm:text-xs" aria-hidden />
              <span>{ratingSafe.toFixed(1)}</span>
              <span className="hidden sm:inline">({reviewCount})</span>
            </div>
          )}
        </div>

        <Link href={`/product/${slug}`} className="mb-1 sm:mb-1.5">
          <h3 className="line-clamp-2 text-xs font-semibold leading-snug text-gray-900 transition-colors group-hover:text-brand-greenDark sm:text-sm">
            {name}
          </h3>
        </Link>

        {colorVariants.length > 0 && (
          <div className="mb-1.5 flex items-center gap-1 sm:mb-2 sm:gap-1.5">
            {colorVariants.slice(0, MAX_SWATCHES).map((color) => (
              <button
                key={color.name}
                type="button"
                title={color.name}
                aria-label={`Colour: ${color.name}`}
                onClick={(e) => {
                  e.preventDefault();
                  setActiveColor(activeColor === color.name ? null : color.name);
                }}
                className={`h-3 w-3 flex-shrink-0 rounded-full border transition-transform sm:h-3.5 sm:w-3.5 ${
                  activeColor === color.name
                    ? 'scale-110 ring-2 ring-brand-green ring-offset-1'
                    : ''
                } ${color.hex === '#FFFFFF' ? 'border-gray-300' : 'border-transparent'}`}
                style={{ backgroundColor: color.hex }}
              />
            ))}
            {colorVariants.length > MAX_SWATCHES && (
              <span className="text-[10px] text-gray-400">+{colorVariants.length - MAX_SWATCHES}</span>
            )}
          </div>
        )}

        <div className="mb-2 mt-auto flex items-baseline gap-1 sm:mb-2.5 sm:gap-1.5">
          <span className="text-sm font-extrabold text-gray-900 sm:text-base">
            {hasVariants && minVariantPrice
              ? `From ${moneyLabel(minVariantPrice)}`
              : asNumber(price) > 0
                ? moneyLabel(price)
                : 'See sizes'}
          </span>
          {originalPrice != null && asNumber(originalPrice) > 0 && (
            <span className="text-[10px] text-gray-400 line-through sm:text-xs">
              {moneyLabel(originalPrice)}
            </span>
          )}
        </div>

        {hasVariants ? (
          <Link
            href={`/product/${slug}`}
            className="inline-flex w-full items-center justify-center gap-1 rounded-lg border border-brand-green/25 bg-white py-2 text-[11px] font-semibold text-brand-greenDark transition-colors hover:bg-brand-greenLight sm:rounded-xl sm:py-2.5 sm:text-sm"
          >
            <i className="ri-list-check text-sm" aria-hidden />
            <span>{inStock ? 'Choose size' : 'Preorder'}</span>
          </Link>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              addToCart({ id, name, price, image, quantity: moq, slug, maxStock, moq, isPreorder: !inStock });
            }}
            disabled={!(asNumber(price) > 0)}
            className="inline-flex w-full items-center justify-center gap-1 rounded-lg bg-gray-900 py-2 text-[11px] font-semibold text-white shadow-sm transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-300 sm:rounded-xl sm:py-2.5 sm:text-sm"
          >
            <i className={`${inStock ? 'ri-shopping-cart-2-line' : 'ri-time-line'} text-sm`} aria-hidden />
            <span>{!inStock ? 'Preorder' : moq > 1 ? `Add ${moq}` : 'Add'}</span>
          </button>
        )}
      </div>
    </article>
  );
}
