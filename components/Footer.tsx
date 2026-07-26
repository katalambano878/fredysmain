"use client";

import Link from 'next/link';
import { useState } from 'react';
import { useCMS } from '@/context/CMSContext';

function NewsletterForm() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'err'>('idle');
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus('loading');
    setMessage('');
    try {
      const res = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Subscription failed');
      setStatus('ok');
      setMessage('Thanks for subscribing!');
      setEmail('');
    } catch (err: unknown) {
      setStatus('err');
      setMessage(err instanceof Error ? err.message : 'Could not subscribe');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-2 pt-4 border-t border-emerald-800/50">
      <p className="text-sm font-semibold text-emerald-100">Newsletter</p>
      <div className="flex gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Your email"
          className="flex-1 min-w-0 px-3 py-2 rounded-lg text-sm text-gray-900 border-0"
          required
        />
        <button
          type="submit"
          disabled={status === 'loading'}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-lg disabled:opacity-60"
        >
          Join
        </button>
      </div>
      {message && (
        <p className={`text-xs ${status === 'err' ? 'text-red-300' : 'text-emerald-200'}`}>{message}</p>
      )}
    </form>
  );
}

function FooterSection({ title, children }: { title: string, children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border-b border-emerald-800/50 lg:border-none last:border-0">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between py-4 text-left lg:py-0 lg:cursor-default lg:mb-6"
      >
        <h4 className="font-bold text-lg text-white">{title}</h4>
        <i className={`ri-arrow-down-s-line text-emerald-400 text-xl transition-transform duration-300 lg:hidden ${isOpen ? 'rotate-180' : ''}`}></i>
      </button>
      <div className={`overflow-hidden transition-all duration-300 ${isOpen ? 'max-h-96 pb-6' : 'max-h-0 lg:max-h-full lg:overflow-visible'}`}>
        {children}
      </div>
    </div>
  );
}

export default function Footer() {
  const { getSetting } = useCMS();
  const rawSiteName = getSetting("site_name") || "";
  const siteName =
    rawSiteName && !/deliz/i.test(rawSiteName) ? rawSiteName : "Freby’s Fashion GH";
  const siteTagline =
    getSetting("site_tagline") ||
    "Unique kids ready-to-wear outfits for all occasions.";
  const contactEmail = getSetting('contact_email') || '';
  const contactPhone = getSetting("contact_phone") || "0244720197";
  const whatsappLink = `https://wa.me/233${contactPhone.replace(/^0/, "")}`;

  return (
    <footer className="bg-emerald-950 text-white rounded-t-[2.5rem] mt-8 lg:mt-0 overflow-hidden">
      <div className="max-w-7xl mx-auto px-6 py-12 lg:py-16">
        <div className="grid lg:grid-cols-4 gap-12">

          {/* Brand Column */}
          <div className="lg:col-span-1 space-y-6">
            <Link href="/" className="inline-block">
              <img
                src="/frebys-logo.png"
                alt={siteName}
                className="h-16 w-auto object-contain"
              />
            </Link>
            <p className="text-emerald-200/80 leading-relaxed text-sm">
              {siteTagline.replace(/Less\.?$/i, '').trimEnd()}
            </p>

            <div className="flex gap-4 pt-2">
              <a
                href={whatsappLink}
                target="_blank"
                rel="noopener noreferrer"
                className="w-10 h-10 bg-emerald-900/50 rounded-full flex items-center justify-center text-emerald-300 hover:bg-emerald-500 hover:text-emerald-950 transition-all hover:-translate-y-1"
                aria-label="Chat on WhatsApp"
              >
                <i className="ri-whatsapp-line"></i>
              </a>
            </div>

            <div className="space-y-3 pt-4 border-t border-emerald-800/50">
              {contactPhone && (
                <div className="flex flex-col gap-2">
                  <a href={`tel:${contactPhone}`} className="flex items-center gap-3 text-emerald-200 hover:text-white transition-colors text-sm">
                    <i className="ri-phone-line"></i> {contactPhone}
                  </a>
                </div>
              )}
              {contactEmail && (
                <a href={`mailto:${contactEmail}`} className="flex items-center gap-3 text-emerald-200 hover:text-white transition-colors text-sm">
                  <i className="ri-mail-line"></i> {contactEmail}
                </a>
              )}
            </div>

            <NewsletterForm />
          </div>

          {/* Links Sections */}
          <div className="lg:col-span-3 grid lg:grid-cols-3 gap-8 lg:gap-12">

            <FooterSection title="Shop">
              <ul className="space-y-4 text-emerald-100/80">
                <li><Link href="/shop" className="hover:text-emerald-300 transition-colors flex items-center gap-2"><i className="ri-arrow-right-s-line opacity-50"></i> All Products</Link></li>
                <li><Link href="/categories" className="hover:text-emerald-300 transition-colors flex items-center gap-2"><i className="ri-arrow-right-s-line opacity-50"></i> Categories</Link></li>
                <li><Link href="/shop?sort=newest" className="hover:text-emerald-300 transition-colors flex items-center gap-2"><i className="ri-arrow-right-s-line opacity-50"></i> New Arrivals</Link></li>
                <li><Link href="/shop?sort=bestsellers" className="hover:text-emerald-300 transition-colors flex items-center gap-2"><i className="ri-arrow-right-s-line opacity-50"></i> Best Sellers</Link></li>
                <li><Link href="/gallery" className="hover:text-emerald-300 transition-colors flex items-center gap-2"><i className="ri-arrow-right-s-line opacity-50"></i> Gallery</Link></li>
              </ul>
            </FooterSection>

            <FooterSection title="Customer Care">
              <ul className="space-y-4 text-emerald-100/80">
                <li><Link href="/contact" className="hover:text-emerald-300 transition-colors flex items-center gap-2"><i className="ri-arrow-right-s-line opacity-50"></i> Contact Us</Link></li>
                <li><Link href="/order-tracking" className="hover:text-emerald-300 transition-colors flex items-center gap-2"><i className="ri-arrow-right-s-line opacity-50"></i> Track My Order</Link></li>
                <li><Link href="/shipping" className="hover:text-emerald-300 transition-colors flex items-center gap-2"><i className="ri-arrow-right-s-line opacity-50"></i> Shipping Info</Link></li>
                <li><Link href="/returns" className="hover:text-emerald-300 transition-colors flex items-center gap-2"><i className="ri-arrow-right-s-line opacity-50"></i> Returns Policy</Link></li>
              </ul>
            </FooterSection>

            <FooterSection title="Company">
              <ul className="space-y-4 text-emerald-100/80">
                <li><Link href="/about" className="hover:text-emerald-300 transition-colors flex items-center gap-2"><i className="ri-arrow-right-s-line opacity-50"></i> Our Story</Link></li>
                <li><Link href="/blog" className="hover:text-emerald-300 transition-colors flex items-center gap-2"><i className="ri-arrow-right-s-line opacity-50"></i> Blog</Link></li>
                <li><Link href="/privacy" className="hover:text-emerald-300 transition-colors flex items-center gap-2"><i className="ri-arrow-right-s-line opacity-50"></i> Privacy Policy</Link></li>
                <li><Link href="/terms" className="hover:text-emerald-300 transition-colors flex items-center gap-2"><i className="ri-arrow-right-s-line opacity-50"></i> Terms of Service</Link></li>
              </ul>
            </FooterSection>

          </div>
        </div>

        <div className="border-t border-emerald-800/50 mt-12 pt-8 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-emerald-400/60">
          <p>
            &copy;{' '}
            <Link href="/admin/login" className="hover:text-emerald-300/80 transition-colors">
              {new Date().getFullYear()}
            </Link>{' '}
            {siteName}. All rights reserved.
          </p>
          <p>
            Powered by{' '}
            <a
              href="https://doctorbarns.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-300 hover:text-white transition-colors font-medium"
            >
              Doctor Barns Tech
            </a>
          </p>
          <div className="flex gap-4 grayscale opacity-50">
            <i className="ri-visa-line text-2xl"></i>
            <i className="ri-mastercard-line text-2xl"></i>
            <i className="ri-paypal-line text-2xl"></i>
          </div>
        </div>
      </div>
    </footer>
  );
}
