'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useCMS } from '@/context/CMSContext';

/**
 * Ask for a password reset link. The link goes to the account's email address and,
 * when the account has a phone number, to that phone by text.
 */
export default function ForgotPasswordPage() {
  const { getSetting } = useCMS();
  const phone = getSetting('contact_phone') || '0244720197';
  const whatsappLink = `https://wa.me/233${phone.replace(/^0/, '')}?text=${encodeURIComponent(
    'Hello, I need help signing in to my Freby’s Fashion GH account.'
  )}`;

  const [identifier, setIdentifier] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const value = identifier.trim();
    if (!value) {
      setError('Enter the email address or phone number on your account.');
      return;
    }
    setSending(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: value }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || 'We could not send the link. Try again in a moment.');
        return;
      }
      setSent(true);
    } catch {
      setError('We could not reach the shop. Check your connection and try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          {sent ? (
            <>
              <h1 className="text-2xl font-bold text-gray-900 mb-3">Check your email and phone</h1>
              <p className="text-gray-700 mb-2">
                If an account matches <span className="font-semibold">{identifier.trim()}</span>, we have sent a link
                to choose a new password. It works once and for 45 minutes.
              </p>
              <p className="text-gray-700 mb-6">Nothing after a few minutes? Check your spam folder, or contact us.</p>
              <button
                type="button"
                onClick={() => {
                  setSent(false);
                  setIdentifier('');
                }}
                className="w-full border-2 border-gray-300 hover:border-gray-400 text-gray-900 py-3 rounded-lg font-semibold transition-colors"
              >
                Try a different email or number
              </button>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-gray-900 mb-3">Forgot your password?</h1>
              <p className="text-gray-700 mb-6">
                Enter the email address or phone number on your account and we will send you a link to choose a new
                password.
              </p>
              <form onSubmit={submit} noValidate>
                <label htmlFor="reset-identifier" className="block text-sm font-medium text-gray-900 mb-2">
                  Email address or phone number
                </label>
                <input
                  id="reset-identifier"
                  type="text"
                  inputMode="email"
                  autoComplete="username"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  aria-describedby="reset-error"
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-gray-600 focus:border-gray-600"
                />
                <p id="reset-error" role="alert" className="mt-2 min-h-[1.25rem] text-sm text-red-700">
                  {error}
                </p>
                <button
                  type="submit"
                  disabled={sending}
                  className="mt-2 w-full bg-gray-900 hover:bg-gray-800 text-white py-4 rounded-lg font-semibold transition-colors disabled:opacity-60"
                >
                  {sending ? 'Sending…' : 'Send reset link'}
                </button>
              </form>
            </>
          )}

          <p className="mt-6 text-sm text-gray-700">
            Still stuck?{' '}
            <a href={whatsappLink} target="_blank" rel="noopener noreferrer" className="font-semibold text-gray-900 underline">
              Message us on WhatsApp
            </a>{' '}
            or call{' '}
            <a href={`tel:${phone}`} className="font-semibold text-gray-900 underline">
              {phone}
            </a>
            .
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
