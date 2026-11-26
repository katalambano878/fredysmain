import { MetadataRoute } from 'next';
import { supabaseAdmin } from '@/lib/supabase-admin';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://www.frebysfashion.com").replace(/\/+$/, "");
  
  const staticPages: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: new Date(), changeFrequency: 'daily', priority: 1 },
    { url: `${baseUrl}/shop`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.9 },
    { url: `${baseUrl}/sale`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.8 },
    { url: `${baseUrl}/categories`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
    { url: `${baseUrl}/gallery`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.7 },
    { url: `${baseUrl}/about`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },
    { url: `${baseUrl}/contact`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },
    { url: `${baseUrl}/faqs`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.4 },
    { url: `${baseUrl}/privacy`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.3 },
    { url: `${baseUrl}/terms`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.3 },
    { url: `${baseUrl}/returns`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.4 },
    { url: `${baseUrl}/shipping`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.4 },
    { url: `${baseUrl}/order-tracking`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.3 },
  ];

  let productPages: MetadataRoute.Sitemap = [];
  let blogPages: MetadataRoute.Sitemap = [];

  try {
    const { data: products } = await supabaseAdmin
      .from('products')
      .select('slug, updated_at')
      .eq('status', 'active');

    if (products) {
      productPages = products.filter((product: { slug: string }) => product.slug).map((product: { slug: string; updated_at: string }) => ({
        url: `${baseUrl}/product/${product.slug}`,
        lastModified: new Date(product.updated_at),
        changeFrequency: 'weekly' as const,
        priority: 0.8,
      }));
    }

    // Category views are /shop?category=..., which all share /shop as their canonical address,
    // so they are not listed here as pages of their own.

    const { data: posts } = await supabaseAdmin
      .from('blog_posts')
      .select('slug, updated_at')
      .eq('status', 'published');

    if (posts) {
      blogPages = posts.map((post: any) => ({
        url: `${baseUrl}/blog/${post.slug}`,
        lastModified: new Date(post.updated_at),
        changeFrequency: 'monthly' as const,
        priority: 0.6,
      }));
    }
  } catch (error) {
    console.error('Sitemap generation error:', error);
  }

  return [...staticPages, ...productPages, ...blogPages];
}
