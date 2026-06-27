'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

interface MobileSearchOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

interface SearchProduct {
  id: string;
  name: string;
  slug: string;
  price: number;
  compare_at_price: number | null;
  category: string;
  image: string;
}

export default function MobileSearchOverlay({ isOpen, onClose }: MobileSearchOverlayProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [products, setProducts] = useState<SearchProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const popularSearches = ['Church wear', 'Traditional', 'Kente', 'Casual', 'Boys', 'Matching sets'];

  useEffect(() => {
    const saved = localStorage.getItem('recentSearches');
    if (saved) setRecentSearches(JSON.parse(saved));
  }, []);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
      setSearchQuery('');
      setProducts([]);
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [isOpen]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (searchQuery.trim().length < 2) {
      setProducts([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/storefront/search?q=${encodeURIComponent(searchQuery.trim())}`);
        const json = await res.json();
        setProducts(json.products || []);
      } catch {
        setProducts([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchQuery]);

  const handleSearch = (q: string) => {
    if (!q.trim()) return;
    const updated = [q, ...recentSearches.filter(s => s !== q)].slice(0, 5);
    setRecentSearches(updated);
    localStorage.setItem('recentSearches', JSON.stringify(updated));
    window.location.href = `/shop?search=${encodeURIComponent(q)}`;
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-white z-50 lg:hidden overflow-y-auto">
      <div className="sticky top-0 bg-white border-b border-gray-200 p-4">
        <div className="flex items-center space-x-3">
          <button
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
          >
            <i className="ri-arrow-left-line text-xl"></i>
          </button>
          <form className="flex-1 relative" onSubmit={(e) => { e.preventDefault(); handleSearch(searchQuery); }}>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search kids styles..."
              className="w-full pl-10 pr-10 py-3 bg-gray-100 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              autoFocus
            />
            <div className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center">
              <i className="ri-search-line text-gray-400 text-lg"></i>
            </div>
            {searchQuery && (
              <button
                type="button"
                onClick={() => { setSearchQuery(''); setProducts([]); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center text-gray-400"
              >
                <i className="ri-close-line text-lg"></i>
              </button>
            )}
          </form>
        </div>
      </div>

      <div className="p-4 space-y-6">
        {/* When no query */}
        {!searchQuery && (
          <>
            {recentSearches.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-900">Recent Searches</h3>
                  <button
                    onClick={() => { setRecentSearches([]); localStorage.removeItem('recentSearches'); }}
                    className="text-xs text-gray-900 font-medium whitespace-nowrap"
                  >
                    Clear All
                  </button>
                </div>
                <div className="space-y-2">
                  {recentSearches.map((search, index) => (
                    <button
                      key={index}
                      onClick={() => handleSearch(search)}
                      className="w-full flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex items-center space-x-3">
                        <i className="ri-time-line text-gray-400"></i>
                        <span className="text-sm text-gray-700">{search}</span>
                      </div>
                      <i className="ri-arrow-right-up-line text-gray-400"></i>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Popular Searches</h3>
              <div className="flex flex-wrap gap-2">
                {popularSearches.map((search, index) => (
                  <button
                    key={index}
                    onClick={() => handleSearch(search)}
                    className="px-4 py-2 bg-gray-100 text-gray-700 text-sm rounded-full hover:bg-gray-200 transition-colors whitespace-nowrap"
                  >
                    {search}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Loading */}
        {searchQuery.trim().length >= 2 && loading && (
          <div className="py-8 text-center text-gray-500">
            <i className="ri-loader-4-line animate-spin text-2xl"></i>
            <p className="text-sm mt-2">Searching...</p>
          </div>
        )}

        {/* Results */}
        {searchQuery.trim().length >= 2 && !loading && products.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Results</h3>
            <div className="space-y-3">
              {products.map((product) => (
                <Link
                  key={product.id}
                  href={`/product/${product.slug}`}
                  className="flex items-center space-x-3 p-2 hover:bg-gray-50 rounded-lg transition-colors"
                  onClick={onClose}
                >
                  {product.image ? (
                    <img src={product.image} alt={product.name} className="w-16 h-16 object-cover object-top rounded-lg" />
                  ) : (
                    <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center">
                      <i className="ri-image-line text-gray-300 text-xl"></i>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-medium text-gray-900 truncate">{product.name}</h4>
                    <p className="text-xs text-gray-500 mt-0.5">{product.category}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <p className="text-sm font-semibold text-gray-900">GH₵ {product.price?.toFixed(2)}</p>
                      {product.compare_at_price && product.compare_at_price > product.price && (
                        <p className="text-xs text-gray-400 line-through">GH₵ {product.compare_at_price.toFixed(2)}</p>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
            <button
              onClick={() => handleSearch(searchQuery)}
              className="w-full mt-3 py-3 text-center text-sm font-medium text-gray-900 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
            >
              View all results →
            </button>
          </div>
        )}

        {/* No results */}
        {searchQuery.trim().length >= 2 && !loading && products.length === 0 && (
          <div className="py-12 text-center">
            <i className="ri-search-line text-4xl text-gray-300"></i>
            <p className="text-gray-500 font-medium mt-2">No products found</p>
            <p className="text-sm text-gray-400 mt-1">Try different keywords</p>
          </div>
        )}
      </div>
    </div>
  );
}
