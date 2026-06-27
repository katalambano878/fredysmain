'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import MiniCart from './MiniCart';
import { useCart } from '@/context/CartContext';
import { supabase } from '@/lib/supabase';
import { useCMS } from '@/context/CMSContext';
import AnnouncementBar from './AnnouncementBar';

const NavLink = ({
  href,
  children,
  isMobile,
  onClick,
  isActive,
}: {
  href: string;
  children: React.ReactNode;
  isMobile?: boolean;
  onClick?: () => void;
  isActive?: boolean;
}) => {
  if (isMobile) {
    return (
      <Link
        href={href}
        onClick={onClick}
        className="block px-4 py-4 text-xl font-medium text-gray-800 hover:text-black hover:bg-gray-50/80 rounded-xl transition-all duration-300"
      >
        {children}
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className={`relative inline-flex items-center rounded-full px-4 py-2 text-[14px] font-semibold tracking-wide transition-all duration-300 ${isActive
          ? 'bg-brand-green text-white shadow-sm'
          : 'text-gray-700 hover:text-brand-greenDark hover:bg-brand-greenLight'
        }`}
    >
      <span className="relative z-10">{children}</span>
    </Link>
  );
};

export default function Header() {
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [wishlistCount, setWishlistCount] = useState(0);
  const [user, setUser] = useState<any>(null);
  const [isScrolled, setIsScrolled] = useState(false);

  const [headerSuggestions, setHeaderSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const headerSearchRef = useRef<HTMLDivElement>(null);
  const headerDebounce = useRef<NodeJS.Timeout | null>(null);

  const { cartCount, isCartOpen, setIsCartOpen } = useCart();
  const { getSetting } = useCMS();

  const rawSiteName = getSetting('site_name') || '';
  const siteName = rawSiteName && !/deliz/i.test(rawSiteName) ? rawSiteName : 'Freby’s Fashion GH';

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 15);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });

    // Wishlist logic
    const updateWishlistCount = () => {
      const wishlist = JSON.parse(localStorage.getItem('wishlist') || '[]');
      setWishlistCount(wishlist.length);
    };

    updateWishlistCount();
    window.addEventListener('wishlistUpdated', updateWishlistCount);

    // Auth logic
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user ?? null);
    };

    checkUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('wishlistUpdated', updateWishlistCount);
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (headerSearchRef.current && !headerSearchRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (headerDebounce.current) clearTimeout(headerDebounce.current);
    if (searchQuery.trim().length < 2) { setHeaderSuggestions([]); return; }
    headerDebounce.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/storefront/search?q=${encodeURIComponent(searchQuery.trim())}`);
        const json = await res.json();
        setHeaderSuggestions(json.products || []);
        setShowSuggestions(true);
      } catch { setHeaderSuggestions([]); }
    }, 300);
    return () => { if (headerDebounce.current) clearTimeout(headerDebounce.current); };
  }, [searchQuery]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      setShowSuggestions(false);
      window.location.href = `/shop?search=${encodeURIComponent(searchQuery)}`;
    }
  };

  return (
    <>
      <AnnouncementBar />

      <header
        className={`sticky top-0 z-50 pwa-header transition-all duration-500 ease-in-out border-b ${isScrolled
            ? 'bg-white/90 backdrop-blur-xl border-brand-green/30 shadow-[0_10px_30px_rgba(42,181,42,0.2)] py-2'
            : 'bg-white border-transparent py-4'
          }`}
      >
        <div className="safe-area-top" />
        <nav aria-label="Main navigation">
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            <div className="flex items-center justify-between">

              {/* Left Side: Mobile Menu & Logo */}
              <div className="flex items-center gap-4 flex-1 lg:flex-none">
                <button
                  className="lg:hidden p-2 -ml-2 text-gray-700 hover:text-black rounded-full hover:bg-gray-100/80 transition-all duration-300"
                  onClick={() => setIsMobileMenuOpen(true)}
                  aria-label="Open menu"
                >
                  <i className="ri-menu-4-line text-2xl"></i>
                </button>
                <Link
                  href="/"
                  className="flex items-center group"
                  aria-label="Go to homepage"
                >
                  <img
                    src="/frebys-logo.png"
                    alt={siteName}
                    className="h-11 sm:h-12 w-auto object-contain transition-transform duration-500 group-hover:scale-[1.02]"
                  />
                </Link>
              </div>

              {/* Center: Desktop Navigation */}
              <div className="hidden lg:flex items-center justify-center flex-1">
                <div className="inline-flex items-center gap-1 rounded-full border border-brand-green/20 bg-white/90 p-1 shadow-sm">
                  <NavLink href="/shop" isActive={pathname === '/shop'}>Shop</NavLink>
                  <NavLink href="/categories" isActive={pathname === '/categories'}>Categories</NavLink>
                  <NavLink href="/gallery" isActive={pathname === '/gallery'}>Gallery</NavLink>
                  <NavLink href="/about" isActive={pathname === '/about'}>About</NavLink>
                  <NavLink href="/contact" isActive={pathname === '/contact'}>Contact</NavLink>
                </div>
              </div>

              {/* Right Side: Actions */}
              <div className="flex items-center space-x-2 md:space-x-3 flex-1 justify-end">

                {/* Mobile Search Icon */}
                <button
                  className="w-10 h-10 flex items-center justify-center text-gray-700 hover:text-black hover:bg-gray-100/80 rounded-full transition-all duration-300 lg:hidden group"
                  onClick={() => setIsSearchOpen(true)}
                  aria-label="Open search"
                >
                  <i className="ri-search-line text-xl transition-transform group-hover:scale-110"></i>
                </button>

                {/* Desktop Search Input */}
                <div ref={headerSearchRef} className="hidden lg:block relative group">
                  <input
                    type="search"
                    placeholder="Search kids styles..."
                    className="w-56 focus:w-80 pl-11 pr-4 py-2.5 bg-brand-greenLight/70 hover:bg-brand-greenLight focus:bg-white border border-brand-green/20 focus:border-brand-green rounded-full transition-all duration-500 ease-out text-sm outline-none placeholder-gray-500 font-medium"
                    aria-label="Search products"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onFocus={() => { if (headerSuggestions.length > 0) setShowSuggestions(true); }}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch(e)}
                  />
                  <i className="ri-search-line absolute left-4 top-1/2 -translate-y-1/2 text-brand-greenDark/70 group-focus-within:text-brand-greenDark transition-colors text-lg"></i>

                  {showSuggestions && headerSuggestions.length > 0 && (
                    <div className="absolute top-full mt-2 right-0 w-80 bg-white rounded-xl shadow-2xl border border-gray-200 max-h-96 overflow-y-auto z-50">
                      <p className="text-xs font-semibold text-gray-500 px-4 pt-3 pb-1">Products</p>
                      {headerSuggestions.map((p: any) => (
                        <Link
                          key={p.id}
                          href={`/product/${p.slug}`}
                          onClick={() => setShowSuggestions(false)}
                          className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors"
                        >
                          {p.image ? (
                            <img src={p.image} alt={p.name} className="w-10 h-10 rounded-lg object-cover object-top" />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center"><i className="ri-image-line text-gray-300"></i></div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
                            <p className="text-xs text-gray-500">{p.category}</p>
                          </div>
                          <p className="text-sm font-bold text-gray-900 whitespace-nowrap">GH₵ {p.price?.toFixed(2)}</p>
                        </Link>
                      ))}
                      <button
                        onClick={(e) => handleSearch(e)}
                        className="w-full text-center py-2.5 text-sm font-medium text-brand-greenDark hover:bg-gray-50 border-t border-gray-100 transition-colors"
                      >
                        View all results →
                      </button>
                    </div>
                  )}
                </div>

                {/* Wishlist */}
                <Link
                  href="/wishlist"
                  className="relative w-10 h-10 flex items-center justify-center text-gray-700 hover:text-brand-greenDark hover:bg-brand-greenLight rounded-full transition-all duration-300 group"
                  aria-label={`Wishlist, ${wishlistCount} items`}
                >
                  <i className="ri-heart-3-line text-xl transition-transform group-hover:scale-110"></i>
                  {wishlistCount > 0 && (
                    <span className="absolute top-0 right-0 w-[18px] h-[18px] bg-black text-white text-[10px] font-bold rounded-full flex items-center justify-center transform scale-100 group-hover:scale-110 transition-transform shadow-md border-2 border-white">
                      {wishlistCount}
                    </span>
                  )}
                </Link>

                {/* Cart */}
                <div className="relative">
                  <button
                    className="relative w-10 h-10 flex items-center justify-center text-gray-700 hover:text-brand-greenDark hover:bg-brand-greenLight rounded-full transition-all duration-300 group"
                    onClick={() => setIsCartOpen(!isCartOpen)}
                    aria-label={`Shopping cart, ${cartCount} items`}
                    aria-expanded={isCartOpen}
                    aria-controls="mini-cart"
                  >
                    <i className="ri-shopping-bag-line text-xl transition-transform group-hover:-translate-y-0.5 group-hover:scale-110"></i>
                    {cartCount > 0 && (
                      <span className="absolute top-0 right-0 w-[18px] h-[18px] bg-black text-white text-[10px] font-bold rounded-full flex items-center justify-center transform scale-100 group-hover:scale-110 transition-transform shadow-md border-2 border-white">
                        {cartCount}
                      </span>
                    )}
                  </button>
                  <MiniCart isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} />
                </div>

                {/* Account */}
                {user ? (
                  <Link
                    href="/account"
                    className="hidden lg:flex w-10 h-10 items-center justify-center text-gray-700 hover:text-brand-greenDark hover:bg-brand-greenLight rounded-full transition-all duration-300 group"
                    aria-label="My account"
                    title="Account"
                  >
                    <i className="ri-user-smile-line text-xl transition-transform group-hover:scale-110"></i>
                  </Link>
                ) : (
                  <Link
                    href="/auth/login"
                    className="hidden lg:flex w-10 h-10 items-center justify-center text-gray-700 hover:text-brand-greenDark hover:bg-brand-greenLight rounded-full transition-all duration-300 group"
                    aria-label="Login"
                    title="Login"
                  >
                    <i className="ri-user-line text-xl transition-transform group-hover:scale-110"></i>
                  </Link>
                )}
              </div>
            </div>
          </div>
        </nav>
      </header>

      {/* Global Search Modal */}
      {isSearchOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-start justify-center pt-24 transition-opacity duration-300">
          <div
            className="absolute inset-0"
            onClick={() => setIsSearchOpen(false)}
            aria-hidden="true"
          />
          <div className="bg-white/95 backdrop-blur-xl rounded-2xl w-full max-w-2xl mx-4 shadow-2xl relative transform animate-in fade-in slide-in-from-top-10 duration-300">
            <div className="p-8">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-medium tracking-tight text-gray-900">What are you looking for?</h3>
                <button
                  onClick={() => setIsSearchOpen(false)}
                  className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-black hover:bg-gray-100 rounded-full transition-all duration-300"
                >
                  <i className="ri-close-line text-2xl"></i>
                </button>
              </div>
              <form onSubmit={handleSearch}>
                <div className="relative group">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search products, brands, categories..."
                    className="w-full px-6 py-4 pr-16 bg-gray-50/50 border-2 border-gray-100 rounded-2xl focus:bg-white focus:ring-4 focus:ring-gray-100/50 focus:border-black text-lg transition-all duration-300 outline-none"
                    autoFocus
                  />
                  <button
                    type="submit"
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center text-white bg-black hover:bg-gray-800 rounded-xl transition-all duration-300 shadow-md group-focus-within:bg-black"
                  >
                    <i className="ri-search-line text-xl"></i>
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Menu Drawer */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-[110] lg:hidden">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300 ease-linear"
            onClick={() => setIsMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute top-0 left-0 bottom-0 w-[85%] max-w-sm bg-white shadow-2xl flex flex-col animate-in slide-in-from-left duration-500 ease-out">
            <div className="px-6 py-5 flex items-center justify-between bg-white relative z-10 border-b border-gray-100/50">
              <Link href="/" onClick={() => setIsMobileMenuOpen(false)}>
                <img
                  src="/frebys-logo.png"
                  alt={siteName}
                  className="h-10 w-auto object-contain"
                />
              </Link>
              <button
                onClick={() => setIsMobileMenuOpen(false)}
                className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-black hover:bg-gray-100 rounded-full transition-all duration-300"
                aria-label="Close menu"
              >
                <i className="ri-close-line text-2xl"></i>
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto pt-6 pb-20 px-4 space-y-1">
              {[
                { label: 'Home', href: '/' },
                { label: 'Shop', href: '/shop' },
                { label: 'Categories', href: '/categories' },
                { label: 'Gallery', href: '/gallery' },
                { label: 'About', href: '/about' },
                { label: 'Contact', href: '/contact' },
              ].map((link, index) => (
                <div
                  key={link.href}
                  className="animate-in slide-in-from-left-4 fade-in duration-500 fill-mode-both"
                  style={{ animationDelay: `${index * 75}ms` }}
                >
                  <NavLink
                    href={link.href}
                    isMobile
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    {link.label}
                  </NavLink>
                </div>
              ))}

              <div className="my-6 space-y-4 px-4 pt-6 border-t border-gray-100">
                <button
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent('show-pwa-install-guide'));
                    setIsMobileMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-base font-medium text-white bg-black hover:bg-gray-800 rounded-xl transition-all shadow-md active:scale-95"
                >
                  <i className="ri-download-cloud-2-line text-lg"></i>
                  Install App for Better Experience
                </button>
              </div>

              <div className="px-2 space-y-1 pt-4">
                {[
                  { label: 'Track Order', href: '/order-tracking', icon: 'ri-truck-line' },
                  { label: 'Wishlist', href: '/wishlist', icon: 'ri-heart-line' },
                  { label: 'My Account', href: '/account', icon: 'ri-user-line' },
                ].map((link, index) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="flex items-center gap-3 px-4 py-3 text-[15px] font-medium text-gray-600 hover:text-black hover:bg-gray-50 rounded-xl transition-all duration-300"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    <i className={`${link.icon} text-xl text-gray-400`}></i>
                    {link.label}
                  </Link>
                ))}
              </div>
            </nav>

            <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-white via-white to-transparent pointer-events-none">
              <p className="text-xs text-center font-medium text-gray-400">
                &copy; {new Date().getFullYear()} {siteName}. All rights reserved.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}