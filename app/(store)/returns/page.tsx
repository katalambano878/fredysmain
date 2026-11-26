'use client';

import Link from 'next/link';
import PageHero from '@/components/PageHero';
import { useCMS } from '@/context/CMSContext';
import { HERO_IMAGES } from '@/lib/hero-images';

/**
 * How to ask for a return or an exchange. The shop handles each request personally,
 * so this page explains how to reach the team and what to have ready. It does not
 * promise terms the shop has not set.
 */
export default function ReturnsPage() {
  const { getSetting } = useCMS();
  const phone = getSetting('contact_phone') || '0244720197';
  const whatsappLink = `https://wa.me/233${phone.replace(/^0/, '')}?text=${encodeURIComponent(
    'Hello, I would like to ask about a return or exchange. My order number is '
  )}`;

  return (
    <div className="min-h-screen bg-white">
      <PageHero
        title="Returns and exchanges"
        subtitle="Something not right with your order? Tell us and we will sort it out with you."
        image={HERO_IMAGES.shipping}
        imagePosition="50% 40%"
      />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-10">
        <section>
          <h2 className="text-2xl font-bold text-gray-900 mb-3">How to ask for a return or exchange</h2>
          <ol className="list-decimal pl-5 space-y-3 text-gray-700">
            <li>
              Contact us as soon as you can after you receive your order. WhatsApp is the quickest way to reach us.
            </li>
            <li>
              Send your order number, the item and size, and what is wrong. A photo helps if the item arrived damaged
              or is not what you ordered.
            </li>
            <li>
              Our team looks at each request and replies to tell you what we can do, for example a different size, a
              replacement or a refund, and how to get the item back to us.
            </li>
          </ol>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-gray-900 mb-3">Before you send anything back</h2>
          <ul className="list-disc pl-5 space-y-2 text-gray-700">
            <li>Please wait for our reply first, so we can agree the next step with you.</li>
            <li>Keep the item as you received it, unworn and with its tags, until we have confirmed.</li>
            <li>
              Not sure about a size before you buy? Ask us first. We are happy to help you choose.
            </li>
          </ul>
        </section>

        <section className="rounded-xl border border-gray-200 bg-gray-50 p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Contact us about an order</h2>
          <div className="flex flex-col sm:flex-row gap-3">
            <a
              href={whatsappLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 bg-gray-900 hover:bg-gray-800 text-white px-6 py-3 rounded-lg font-semibold transition-colors"
            >
              <i className="ri-whatsapp-line text-xl" aria-hidden></i>
              WhatsApp us
            </a>
            <a
              href={`tel:${phone}`}
              className="inline-flex items-center justify-center gap-2 border-2 border-gray-300 hover:border-gray-400 text-gray-900 px-6 py-3 rounded-lg font-semibold transition-colors"
            >
              <i className="ri-phone-line text-xl" aria-hidden></i>
              Call {phone}
            </a>
            <Link
              href="/contact"
              className="inline-flex items-center justify-center gap-2 border-2 border-gray-300 hover:border-gray-400 text-gray-900 px-6 py-3 rounded-lg font-semibold transition-colors"
            >
              <i className="ri-mail-line text-xl" aria-hidden></i>
              Send a message
            </Link>
          </div>
          <p className="mt-4 text-sm text-gray-700">
            Want to check where your order is?{' '}
            <Link href="/order-tracking" className="font-semibold text-gray-900 underline">
              Track your order
            </Link>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
