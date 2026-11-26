import type { Metadata } from 'next';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { normalizeStorageUrl } from '@/lib/storage-url';
import { stripHtml } from '@/lib/product-seo';
import ProductDetailClient from './ProductDetailClient';

const siteUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://www.frebysfashion.com').replace(/\/+$/, '');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The outfit behind a link. The link carries the slug, or the product id (the cart falls back
 * to the id when a product has no slug). Loaded once per request for both the metadata and the page.
 */
const loadProduct = cache(async (slugOrId: string) => {
  const { data } = await supabaseAdmin
    .from('products')
    .select(
      'id, name, slug, description, seo_title, seo_description, status, price, categories(name), product_images(url, position), product_variants(price)'
    )
    .eq(UUID.test(slugOrId) ? 'id' : 'slug', slugOrId)
    .maybeSingle();
  return data && data.status === 'active' ? data : null;
});

/**
 * Title, description and share image for one outfit, rendered on the server so that
 * search engines and WhatsApp / Facebook link previews show the outfit, not the shop logo.
 */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const missing: Metadata = { title: 'Outfit not found', robots: { index: false, follow: true } };

  try {
    const product = await loadProduct(slug);
    if (!product) return missing;

    const name = String(product.name || 'Outfit').trim();
    const category = (product.categories as { name?: string } | null)?.name?.trim() || '';
    const prices = [Number(product.price), ...((product.product_variants as any[]) || []).map((v) => Number(v.price))].filter(
      (n) => Number.isFinite(n) && n > 0
    );
    const fromPrice = prices.length ? Math.min(...prices) : null;

    const written = stripHtml(String(product.seo_description || product.description || ''));
    const description = (
      written ||
      [
        `${name}${category ? `, ${category.toLowerCase()}` : ''} from Freby’s Fashion GH.`,
        fromPrice ? `From GH₵${fromPrice.toFixed(2)}.` : '',
        'Delivery across Ghana and worldwide from Accra.',
      ]
        .filter(Boolean)
        .join(' ')
    ).slice(0, 160);

    const images = [...((product.product_images as any[]) || [])]
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .map((img) => normalizeStorageUrl(String(img.url || ''), siteUrl))
      // Share previews need a picture, not a product video.
      .filter((url) => url && !/\.(mp4|mov|webm)(\?|$)/i.test(url));
    const image = images[0] || `${siteUrl}/frebys-logo.png`;
    const url = `${siteUrl}/product/${product.slug}`;

    return {
      title: name,
      description,
      alternates: { canonical: url },
      openGraph: {
        type: 'website',
        locale: 'en_GH',
        siteName: 'Freby’s Fashion GH',
        url,
        title: `${name} | Freby’s Fashion GH`,
        description,
        images: [{ url: image, secureUrl: image, alt: name }],
      },
      twitter: {
        card: 'summary_large_image',
        title: `${name} | Freby’s Fashion GH`,
        description,
        images: [image],
      },
    };
  } catch (err) {
    console.error('[product metadata] failed for', slug, err);
    return missing;
  }
}

export default async function ProductDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let product: Awaited<ReturnType<typeof loadProduct>> | undefined;
  try {
    product = await loadProduct(slug);
  } catch (err) {
    // A database hiccup must not turn a real outfit into "not found": let the page try in the browser.
    console.error('[product page] lookup failed for', slug, err);
  }
  // A real 404 (not a 200 page that says "not found") for outfits that are gone or archived.
  if (product === null) notFound();
  return <ProductDetailClient slug={slug} />;
}
