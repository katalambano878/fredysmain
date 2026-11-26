import Link from 'next/link';

/** The "page not found" message, shared by the store and the site-wide 404. */
export default function NotFoundContent({
  title = 'We could not find that page',
  message = 'The link may be old, or the page may have moved. You can carry on from the shop or the home page.',
}: {
  title?: string;
  message?: string;
}) {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 py-16 text-center">
      <p className="text-sm font-semibold text-gray-600">Error 404</p>
      <h1 className="mt-2 text-3xl sm:text-4xl font-bold text-gray-900">{title}</h1>
      <p className="mt-4 max-w-md text-gray-700">{message}</p>
      <div className="mt-8 flex flex-col sm:flex-row gap-3">
        <Link
          href="/shop"
          className="inline-flex items-center justify-center rounded-lg bg-gray-900 px-6 py-3 font-semibold text-white hover:bg-gray-800 transition-colors"
        >
          Go to the shop
        </Link>
        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-lg border-2 border-gray-300 px-6 py-3 font-semibold text-gray-900 hover:border-gray-400 transition-colors"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}
