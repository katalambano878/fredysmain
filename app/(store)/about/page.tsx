'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCMS } from '@/context/CMSContext';
import { usePageTitle } from '@/hooks/usePageTitle';
import AnimatedSection, { AnimatedGrid } from '@/components/AnimatedSection';

type ValueCard = {
  icon: string;
  title: string;
  body: string;
};

type JourneyStep = {
  label: string;
  title: string;
  body: string;
};

export default function AboutPage() {
  usePageTitle('Our Story');
  const { getSetting } = useCMS();

  const siteName = getSetting('site_name') || 'Freby’s Fashion GH';

  const valueCards: ValueCard[] = [
    {
      icon: 'ri-scissors-cut-line',
      title: 'Crafted with care',
      body: 'Every piece is designed for active kids and stitched for comfort, movement, and confidence.',
    },
    {
      icon: 'ri-palette-line',
      title: 'Culture in every detail',
      body: 'Unique kids ready-to-wear outfits for all occasions, designed with care.',
    },
    {
      icon: 'ri-earth-line',
      title: 'Worldwide delivery',
      body: 'From Haatso, Accra to families around the world, we deliver reliable style with heart.',
    },
  ];

  const journeySteps: JourneyStep[] = [
    {
      label: '01',
      title: 'Design direction',
      body: 'We sketch playful concepts inspired by family moments, celebrations, and everyday elegance.',
    },
    {
      label: '02',
      title: 'Fabric and fit',
      body: 'We select quality fabric and refine patterns to keep kids comfortable all day.',
    },
    {
      label: '03',
      title: 'Final finishing',
      body: 'Each outfit is checked for quality and prepared for local and international delivery.',
    },
  ];

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <section className="border-b border-brand-green/10 bg-brand-greenLight/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-16 lg:py-20">
          <div className="grid gap-10 lg:grid-cols-12 lg:items-center">
            <AnimatedSection className="lg:col-span-6" animation="fade-up">
              <p className="text-xs font-semibold tracking-[0.25em] uppercase text-brand-greenDark">
                About {siteName}
              </p>
              <h1 className="mt-3 text-3xl sm:text-4xl lg:text-5xl font-extrabold leading-tight text-gray-900">
                A different kind of kids fashion story.
              </h1>
              <p className="mt-5 text-base sm:text-lg text-gray-700 max-w-xl">
                Unique kids ready-to-wear outfits for all occasions — joyful, practical, and premium for every family moment.
              </p>

              <div className="mt-7 flex flex-wrap gap-3">
                <span className="inline-flex items-center rounded-full bg-white px-4 py-2 text-sm font-medium text-brand-greenDark border border-brand-green/20">
                  <i className="ri-map-pin-line mr-2" /> Haatso, Accra, Ghana
                </span>
                <span className="inline-flex items-center rounded-full bg-white px-4 py-2 text-sm font-medium text-brand-greenDark border border-brand-green/20">
                  <i className="ri-truck-line mr-2" /> Worldwide delivery
                </span>
              </div>

              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/shop"
                  className="inline-flex items-center rounded-full bg-brand-orange px-7 py-3 text-sm font-semibold text-white hover:bg-brand-orangeDark transition-colors"
                >
                  Explore collection
                  <i className="ri-arrow-right-up-line ml-2" />
                </Link>
                <Link
                  href="/contact"
                  className="inline-flex items-center rounded-full border border-brand-green/35 bg-white px-7 py-3 text-sm font-semibold text-brand-greenDark hover:bg-brand-greenLight transition-colors"
                >
                  Contact our team
                </Link>
              </div>
            </AnimatedSection>

            <AnimatedSection className="lg:col-span-6" animation="fade-left">
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <div className="relative overflow-hidden rounded-2xl aspect-[4/5] border border-brand-green/15 bg-brand-green/10">
                  <Image
                    src="/hero-frebys-1.png"
                    alt="Freby’s kids fashion"
                    fill
                    className="object-cover"
                    sizes="(max-width: 1024px) 50vw, 33vw"
                  />
                </div>
                <div className="relative overflow-hidden rounded-2xl aspect-[4/5] border border-brand-green/15 bg-brand-green/10 mt-8">
                  <Image
                    src="/hero-frebys-2.png"
                    alt="Freby’s Ankara style"
                    fill
                    className="object-cover"
                    sizes="(max-width: 1024px) 50vw, 33vw"
                  />
                </div>
              </div>
            </AnimatedSection>
          </div>
        </div>
      </section>

      <AnimatedSection className="py-14 sm:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold tracking-[0.25em] uppercase text-brand-green">
              What makes us different
            </p>
            <h2 className="mt-2 text-2xl sm:text-3xl font-extrabold text-gray-900">
              Built for children, trusted by families.
            </h2>
          </div>

          <AnimatedGrid className="mt-8 grid gap-4 md:grid-cols-3" staggerDelay={120}>
            {valueCards.map((item) => (
              <div
                key={item.title}
                className="rounded-2xl border border-brand-green/15 bg-white p-6 shadow-sm"
              >
                <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-brand-green text-white">
                  <i className={`${item.icon} text-xl`} />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-600">{item.body}</p>
              </div>
            ))}
          </AnimatedGrid>
        </div>
      </AnimatedSection>

      <section className="bg-brand-greenLight/45 py-14 sm:py-16 border-y border-brand-green/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold tracking-[0.25em] uppercase text-brand-greenDark">
              Our process
            </p>
            <h2 className="mt-2 text-2xl sm:text-3xl font-extrabold text-gray-900">
              How every Freby’s piece comes to life.
            </h2>
          </div>

          <div className="mt-8 grid gap-4 lg:grid-cols-3">
            {journeySteps.map((step) => (
              <div
                key={step.label}
                className="rounded-2xl border border-brand-green/15 bg-white p-6"
              >
                <span className="text-xs font-bold tracking-[0.22em] uppercase text-brand-orange">
                  Step {step.label}
                </span>
                <h3 className="mt-3 text-lg font-semibold text-gray-900">{step.title}</h3>
                <p className="mt-2 text-sm text-gray-600 leading-relaxed">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-14 sm:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="rounded-3xl bg-[#166d1f] border border-[#145b1a] px-6 py-10 sm:px-10 sm:py-12 text-white text-center">
            <p className="text-xs font-semibold tracking-[0.25em] uppercase text-[#dff3e2]">
              Join our journey
            </p>
            <h2 className="mt-3 text-2xl sm:text-3xl font-extrabold">
              Dress your kids in culture, comfort, and confidence.
            </h2>
            <p className="mt-3 text-[#e6f5e8] max-w-2xl mx-auto">
              Unique kids ready-to-wear outfits for all occasions.
            </p>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/shop"
                className="inline-flex items-center rounded-full bg-brand-orange px-7 py-3 text-sm font-semibold text-white hover:bg-brand-orangeDark transition-colors"
              >
                Shop now
              </Link>
              <Link
                href="/contact"
                className="inline-flex items-center rounded-full border border-white/35 bg-white/10 px-7 py-3 text-sm font-semibold text-white hover:bg-white/20 transition-colors"
              >
                Talk to us
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
