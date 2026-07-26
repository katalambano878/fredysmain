/** Shared helpers to generate product SEO fields. */

export function slugifyProduct(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

export function stripHtml(value: string): string {
  return (value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

export type ProductSeoInput = {
  name: string;
  description?: string | null;
  categoryName?: string | null;
  siteName?: string | null;
};

export type ProductSeoFields = {
  seo_title: string;
  seo_description: string;
  tags: string[];
  slug: string;
};

export function buildProductSeo(input: ProductSeoInput): ProductSeoFields {
  const siteName = (input.siteName || process.env.NEXT_PUBLIC_SITE_NAME || "Freby's Fashion GH").trim();
  const name = (input.name || 'Product').trim();
  const category = (input.categoryName || '').trim();
  const plainDesc = stripHtml(input.description || '');

  const seo_title = `${name} | Buy Online in Ghana | ${siteName}`.slice(0, 60);

  let seo_description = plainDesc;
  if (!seo_description) {
    seo_description = [
      `Shop ${name}${category ? ` in ${category}` : ''} at ${siteName}.`,
      'Fast delivery across Ghana.',
    ]
      .filter(Boolean)
      .join(' ');
  }
  seo_description = seo_description.slice(0, 160);

  const tags = Array.from(
    new Set(
      [name, category, siteName, 'Ghana', 'kids fashion Ghana']
        .map((t) => t.trim())
        .filter(Boolean)
    )
  );

  return {
    seo_title,
    seo_description,
    tags,
    slug: slugifyProduct(name),
  };
}
