import type { Metadata } from 'next';

const siteUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://www.frebysfashion.com').replace(/\/+$/, '');
const SITE_NAME = 'Freby’s Fashion GH';

/**
 * Title, description and link-preview tags for one public page.
 * Without the openGraph block a page inherits the home page's preview title and address.
 */
export function pageMetadata({ title, description, path }: { title: string; description: string; path: string }): Metadata {
  const url = `${siteUrl}${path}`;
  const image = `${siteUrl}/frebys-logo.png`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      locale: 'en_GH',
      siteName: SITE_NAME,
      url,
      title: `${title} | ${SITE_NAME}`,
      description,
      images: [{ url: image, secureUrl: image, width: 593, height: 421, alt: `${SITE_NAME} logo` }],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} | ${SITE_NAME}`,
      description,
      images: [image],
    },
  };
}
