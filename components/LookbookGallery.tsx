'use client';

import { useCallback, useEffect, useState, FormEvent } from 'react';
import Image from 'next/image';
import Link from 'next/link';

export type LookbookItem = {
  id: string;
  title: string;
  caption: string | null;
  image_url: string;
  sort_order: number;
};

/** Full-page dress gallery (same data as admin “Homepage gallery”). */
export default function LookbookGallery() {
  const [items, setItems] = useState<LookbookItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState<number | null>(null);

  const [showPreorderForm, setShowPreorderForm] = useState(false);
  const [preorderSubmitting, setPreorderSubmitting] = useState(false);
  const [preorderSuccess, setPreorderSuccess] = useState(false);
  const [preorderError, setPreorderError] = useState('');
  const [formData, setFormData] = useState({ name: '', phone: '', email: '', size: '', notes: '' });

  const resetPreorderState = useCallback(() => {
    setShowPreorderForm(false);
    setPreorderSuccess(false);
    setPreorderError('');
    setFormData({ name: '', phone: '', email: '', size: '', notes: '' });
  }, []);

  const handlePreorderSubmit = useCallback(async (e: FormEvent, item: LookbookItem) => {
    e.preventDefault();
    setPreorderSubmitting(true);
    setPreorderError('');
    try {
      const res = await fetch('/api/storefront/gallery-preorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gallery_item_id: item.id,
          gallery_title: item.title,
          gallery_image_url: item.image_url,
          customer_name: formData.name,
          customer_phone: formData.phone,
          customer_email: formData.email || undefined,
          preferred_size: formData.size || undefined,
          notes: formData.notes || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Something went wrong');
      setPreorderSuccess(true);
    } catch (err: any) {
      setPreorderError(err.message || 'Failed to submit preorder');
    } finally {
      setPreorderSubmitting(false);
    }
  }, [formData]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/storefront/homepage-gallery', { cache: 'no-store' });
        const json = await res.json();
        if (!cancelled && res.ok && Array.isArray(json.items)) {
          setItems(json.items);
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const close = useCallback(() => { setLightbox(null); resetPreorderState(); }, [resetPreorderState]);

  useEffect(() => {
    if (lightbox === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowLeft') setLightbox((i) => (i !== null && i > 0 ? i - 1 : i));
      if (e.key === 'ArrowRight')
        setLightbox((i) => (i !== null && i < items.length - 1 ? i + 1 : i));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox, items.length, close]);

  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="aspect-[3/4] rounded-2xl bg-gray-100 animate-pulse" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-16 px-4 rounded-2xl border border-dashed border-brand-green/25 bg-brand-greenLight/30">
        <i className="ri-image-2-line text-4xl text-brand-green/60 mb-4 block" />
        <p className="text-lg font-semibold text-gray-900">Gallery coming soon</p>
        <p className="mt-2 text-sm text-gray-600 max-w-md mx-auto">
          We’re preparing new photos of our dresses. Browse the shop in the meantime.
        </p>
        <Link
          href="/shop"
          className="inline-flex mt-6 items-center rounded-full bg-brand-orange px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-orangeDark transition-colors"
        >
          Shop collection
          <i className="ri-arrow-right-line ml-2" />
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
        {items.map((item, index) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setLightbox(index)}
            className="group relative aspect-[3/4] overflow-hidden rounded-2xl border border-brand-green/15 bg-white shadow-sm text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange"
          >
            <Image
              src={item.image_url}
              alt={item.title || 'Lookbook photo'}
              fill
              className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent opacity-90" />
            <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-4">
              {item.title ? (
                <p className="text-sm font-semibold text-white drop-shadow line-clamp-2">{item.title}</p>
              ) : null}
              {item.caption ? (
                <p className="mt-1 text-xs text-white/90 line-clamp-2">{item.caption}</p>
              ) : null}
            </div>
          </button>
        ))}
      </div>

      {lightbox !== null && items[lightbox] && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Gallery image"
          onClick={close}
        >
          <button
            type="button"
            className="absolute top-4 right-4 z-[102] flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
            onClick={close}
            aria-label="Close"
          >
            <i className="ri-close-line text-2xl" />
          </button>
          {lightbox > 0 && (
            <button
              type="button"
              className="absolute left-2 sm:left-4 top-1/2 z-[102] -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
              onClick={(e) => {
                e.stopPropagation();
                setLightbox((i) => (i !== null && i > 0 ? i - 1 : i));
              }}
              aria-label="Previous"
            >
              <i className="ri-arrow-left-s-line text-2xl" />
            </button>
          )}
          {lightbox < items.length - 1 && (
            <button
              type="button"
              className="absolute right-2 sm:right-4 top-1/2 z-[102] -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
              onClick={(e) => {
                e.stopPropagation();
                setLightbox((i) => (i !== null && i < items.length - 1 ? i + 1 : i));
              }}
              aria-label="Next"
            >
              <i className="ri-arrow-right-s-line text-2xl" />
            </button>
          )}
          <div
            className="relative max-h-[90vh] max-w-5xl w-full flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative aspect-[3/4] max-h-[60vh] w-full mx-auto">
              <Image
                src={items[lightbox].image_url}
                alt={items[lightbox].title || 'Lookbook'}
                fill
                className="object-contain"
                sizes="100vw"
                priority
              />
            </div>

            <div className="mt-4 text-center text-white w-full max-w-md mx-auto">
              {items[lightbox].title && (
                <p className="text-lg font-semibold">{items[lightbox].title}</p>
              )}
              {items[lightbox].caption && (
                <p className="mt-1 text-sm text-white/85">{items[lightbox].caption}</p>
              )}

              {!showPreorderForm && !preorderSuccess && (
                <button
                  type="button"
                  onClick={() => setShowPreorderForm(true)}
                  className="mt-4 inline-flex items-center gap-2 rounded-full bg-brand-orange px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-orangeDark transition-colors shadow-lg"
                >
                  <i className="ri-shopping-bag-line" />
                  Preorder This Design
                </button>
              )}

              {preorderSuccess && (
                <div className="mt-4 rounded-xl bg-green-600/90 backdrop-blur px-5 py-4 text-white">
                  <i className="ri-check-double-line text-2xl mb-1 block" />
                  <p className="font-semibold">Preorder submitted!</p>
                  <p className="text-sm text-white/90 mt-1">
                    We'll contact you shortly to discuss pricing and details.
                  </p>
                </div>
              )}

              {showPreorderForm && !preorderSuccess && (
                <form
                  onSubmit={(e) => handlePreorderSubmit(e, items[lightbox])}
                  className="mt-4 rounded-xl bg-white/95 backdrop-blur p-5 text-left space-y-3"
                >
                  <p className="text-sm font-bold text-gray-900 text-center">
                    Preorder &ldquo;{items[lightbox].title || 'This design'}&rdquo;
                  </p>
                  <p className="text-xs text-gray-500 text-center">
                    Fill in your details and we'll reach out to discuss pricing and production.
                  </p>

                  {preorderError && (
                    <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{preorderError}</p>
                  )}

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Your name *</label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData(p => ({ ...p, name: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-brand-orange focus:border-brand-orange"
                      placeholder="e.g. Akua Mensah"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Phone number *</label>
                    <input
                      type="tel"
                      required
                      value={formData.phone}
                      onChange={(e) => setFormData(p => ({ ...p, phone: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-brand-orange focus:border-brand-orange"
                      placeholder="e.g. 0244720197"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Email (optional)</label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData(p => ({ ...p, email: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-brand-orange focus:border-brand-orange"
                      placeholder="e.g. akua@email.com"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Preferred size / age</label>
                    <input
                      type="text"
                      value={formData.size}
                      onChange={(e) => setFormData(p => ({ ...p, size: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-brand-orange focus:border-brand-orange"
                      placeholder="e.g. Age 3, Size M"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Notes (optional)</label>
                    <textarea
                      rows={2}
                      value={formData.notes}
                      onChange={(e) => setFormData(p => ({ ...p, notes: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 resize-none focus:ring-2 focus:ring-brand-orange focus:border-brand-orange"
                      placeholder="e.g. I'd like it in blue fabric"
                    />
                  </div>

                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={resetPreorderState}
                      className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={preorderSubmitting}
                      className="flex-1 px-4 py-2.5 bg-brand-orange text-white rounded-lg text-sm font-semibold hover:bg-brand-orangeDark transition-colors disabled:opacity-60"
                    >
                      {preorderSubmitting ? 'Submitting...' : 'Submit Preorder'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
