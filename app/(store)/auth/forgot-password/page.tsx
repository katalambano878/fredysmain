'use client';

import Link from 'next/link';
import { useCMS } from '@/context/CMSContext';

/**
 * Passwords cannot be reset online yet, so this page says so and gives the two ways
 * to reach the shop. It used to show "we've sent a reset link" without sending anything.
 */
export default function ForgotPasswordPage() {
  const { getSetting } = useCMS();
  const phone = getSetting('contact_phone') || '0244720197';
  const whatsappLink = `https://wa.me/233${phone.replace(/^0/, '')}?text=${encodeURIComponent(
    'Hello, I need help signing in to my Freby’s Fashion GH account.'
  )}`;

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-3">Forgot your password?</h1>
          <p className="text-gray-700 mb-6">
            We cannot reset passwords online yet. Message or call us with the email or phone number on your account
            and we will help you sign in again.
          </p>

          <div className="space-y-3">
            <a
              href={whatsappLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-center gap-2 bg-gray-900 hover:bg-gray-800 text-white py-4 rounded-lg font-semibold transition-colors"
            >
              <i className="ri-whatsapp-line text-xl" aria-hidden></i>
              Message us on WhatsApp
            </a>
            <a
              href={`tel:${phone}`}
              className="flex w-full items-center justify-center gap-2 border-2 border-gray-300 hover:border-gray-400 text-gray-900 py-4 rounded-lg font-semibold transition-colors"
            >
              <i className="ri-phone-line text-xl" aria-hidden></i>
              Call {phone}
            </a>
          </div>

          <p className="mt-6 text-sm text-gray-700">
            You do not need an account to shop. You can{' '}
            <Link href="/shop" className="font-semibold text-gray-900 underline">
              keep shopping
            </Link>{' '}
            and check out as a guest.
          </p>

          <div className="mt-6 pt-6 border-t border-gray-200 text-center">
            <Link href="/auth/login" className="font-semibold text-gray-900 underline">
              Back to sign in
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
