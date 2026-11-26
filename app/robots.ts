import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://www.frebysfashion.com').replace(/\/+$/, '');

  return {
    // One rule for every crawler. No trailing slashes, so "/checkout" itself is covered too.
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/admin',
          '/api',
          '/checkout',
          '/cart',
          '/account',
          '/auth',
          '/pay',
          '/order-success',
          '/wishlist',
          '/maintenance',
          '/offline',
          '/pwa-settings',
        ],
      },
    ],
    host: baseUrl,
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
