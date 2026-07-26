'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[admin/error]', error);
  }, [error]);

  return (
    <div className="min-h-[50vh] flex flex-col items-center justify-center px-4 text-center">
      <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-5">
        <i className="ri-error-warning-line text-2xl text-gray-900" />
      </div>
      <h1 className="text-xl md:text-2xl font-bold text-gray-900 mb-2">Admin page error</h1>
      <p className="text-gray-600 mb-2 max-w-md text-sm">
        {error?.message || 'Something went wrong loading this screen.'}
      </p>
      <p className="text-gray-500 mb-6 max-w-md text-xs">
        Try again, or go back to the dashboard. If this persists after a deploy, hard-refresh.
      </p>
      <div className="flex flex-col sm:flex-row gap-3">
        <button
          type="button"
          onClick={reset}
          className="px-6 py-2.5 rounded-lg bg-gray-900 text-white font-semibold hover:bg-gray-800"
        >
          Try again
        </button>
        <Link
          href="/admin"
          className="px-6 py-2.5 rounded-lg border-2 border-gray-900 text-gray-900 font-semibold hover:bg-gray-50"
        >
          Dashboard
        </Link>
      </div>
    </div>
  );
}
