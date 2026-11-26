import type { Metadata } from 'next';
import Link from 'next/link';
import NotFoundContent from '@/components/NotFoundContent';

export const metadata: Metadata = {
  title: 'Page not found',
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <main className="min-h-screen bg-white">
      <div className="border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <Link href="/" aria-label="Freby’s Fashion GH home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/frebys-logo.png" alt="Freby’s Fashion GH" className="h-10 w-auto" />
          </Link>
        </div>
      </div>
      <NotFoundContent />
    </main>
  );
}
