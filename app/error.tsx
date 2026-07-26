'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[app/error]', error);
  }, [error]);

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center px-4 text-center bg-gradient-to-br from-emerald-50 via-white to-white">
      <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mb-6">
        <i className="ri-error-warning-line text-3xl text-emerald-900" />
      </div>
      <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-3">Something went wrong</h1>
      <p className="text-gray-600 mb-8 max-w-md">
        Please try again. If you keep seeing this after a site update, hard-refresh or reopen the app.
      </p>
      <div className="flex flex-col sm:flex-row gap-3">
        <button
          type="button"
          onClick={reset}
          className="px-8 py-3 rounded-full bg-emerald-900 text-white font-semibold hover:bg-emerald-800 transition-colors"
        >
          Try again
        </button>
        <Link
          href="/shop"
          className="px-8 py-3 rounded-full border-2 border-emerald-900 text-emerald-900 font-semibold hover:bg-emerald-50 transition-colors"
        >
          Go to Shop
        </Link>
      </div>
    </div>
  );
}
