import type { Metadata } from 'next';
import PageHero from '@/components/PageHero';
import LookbookGallery from '@/components/LookbookGallery';
import { HERO_IMAGES } from '@/lib/hero-images';

const siteUrl =
  process.env.NEXT_PUBLIC_APP_URL || 'https://frebysfashion.com';

export const metadata: Metadata = {
  title: 'Gallery | Freby\u2019s Fashion GH',
  description:
    'Unique kids ready-to-wear outfits for all occasions from Freby\u2019s Fashion GH in Haatso, Accra.',
  alternates: { canonical: `${siteUrl}/gallery` },
  openGraph: {
    title: 'Gallery | Freby\u2019s Fashion GH',
    description:
      'Unique kids ready-to-wear outfits for all occasions \u2014 handmade in Haatso, Accra with worldwide delivery.',
    url: `${siteUrl}/gallery`,
    type: 'website',
  },
};

export default function GalleryPage() {
  return (
    <div className="min-h-screen bg-white">
      <PageHero
        title="Gallery"
        subtitle="A walk through our dresses and creations \u2014 tap any photo to view it larger."
        image={HERO_IMAGES.gallery}
        imagePosition="50% 30%"
      />
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
        <LookbookGallery />
      </section>
    </div>
  );
}
