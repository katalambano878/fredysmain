'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

interface SearchProduct {
  id: string;
  name: string;
  slug: string;
  price: number;
  compare_at_price: number | null;
  category: string;
  image: string;
}

interface SearchCategory {
  id: string;
  name: string;
  slug: string;
}

export default function AdvancedSearch() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [products, setProducts] = useState<SearchProduct[]>([]);
  const [categories, setCategories] = useState<SearchCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const popularTags = ['Church wear', 'Traditional', 'Kente', 'Casual', 'Boys', 'Dress'];

  useEffect(() => {
    const saved = localStorage.getItem('recentSearches');
    if (saved) setRecentSearches(JSON.parse(saved));
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (query.trim().length < 2) {
      setProducts([]);
      setCategories([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/storefront/search?q=${encodeURIComponent(query.trim())}`);
        const json = await res.json();
        setProducts(json.products || []);
        setCategories(json.categories || []);
      } catch {
        setProducts([]);
        setCategories([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  const handleSearch = (searchQuery: string) => {
    if (searchQuery.trim()) {
      const updated = [searchQuery, ...recentSearches.filter(s => s !== searchQuery)].slice(0, 5);
      setRecentSearches(updated);
      localStorage.setItem('recentSearches', JSON.stringify(updated));
      window.location.href = `/shop?search=${encodeURIComponent(searchQuery)}`;
    }
  };

  const clearRecentSearches = () => {
    setRecentSearches([]);
    localStorage.removeItem('recentSearches');
  };

  const handleVoiceSearch = () => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.onstart = () => setIsVoiceActive(true);
      recognition.onresult = (event: any) => {
        setQuery(event.results[0][0].transcript);
        setIsVoiceActive(false);
      };
      recognition.onerror = () => setIsVoiceActive(false);
      recognition.onend = () => setIsVoiceActive(false);
      recognition.start();
    }
  };

  const hasResults = products.length > 0 || categories.length > 0;

  return (
    <div ref={searchRef} className="relative flex-1 max-w-2xl mx-4">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              handleSearch(query);
              setIsOpen(false);
            }
          }}
          placeholder="Search kids styles..."
          className="w-full pl-12 pr-24 py-3 border-2 border-gray-300 rounded-full focus:border-gray-900 focus:ring-2 focus:ring-gray-200 text-sm"
        />
        <i className="ri-search-line absolute left-4 top-1/2 -translate-y-1/2 text-xl text-gray-400"></i>

        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center space-x-2">
          <button
            onClick={handleVoiceSearch}
            className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors ${
              isVoiceActive ? 'bg-red-500 text-white animate-pulse' : 'hover:bg-gray-100 text-gray-600'
            }`}
          >
            <i className="ri-mic-line"></i>
          </button>
          {query && (
            <button
              onClick={() => { setQuery(''); setProducts([]); setCategories([]); }}
              className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 rounded-full text-gray-600"
            >
              <i className="ri-close-line"></i>
            </button>
          )}
        </div>
      </div>

      {isOpen && (
        <div className="absolute top-full mt-2 w-full bg-white rounded-xl shadow-2xl border border-gray-200 max-h-[28rem] overflow-y-auto z-50">
          {/* Loading */}
          {loading && query.trim().length >= 2 && (
            <div className="p-6 text-center text-gray-500">
              <i className="ri-loader-4-line animate-spin text-xl"></i>
              <p className="text-sm mt-1">Searching...</p>
            </div>
          )}

          {/* Results */}
          {!loading && query.trim().length >= 2 && hasResults && (
            <div className="p-2">
              {categories.length > 0 && (
                <div className="mb-2">
                  <p className="text-xs font-semibold text-gray-500 px-3 py-2">Categories</p>
                  {categories.map((cat) => (
                    <Link
                      key={cat.id}
                      href={`/shop?category=${cat.slug}`}
                      onClick={() => setIsOpen(false)}
                      className="flex items-center space-x-3 p-3 hover:bg-gray-50 rounded-lg transition-colors"
                    >
                      <i className="ri-folder-line text-gray-400"></i>
                      <span className="text-sm font-medium text-gray-900">{cat.name}</span>
                    </Link>
                  ))}
                </div>
              )}
              {products.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 px-3 py-2">Products</p>
                  {products.map((product) => (
                    <Link
                      key={product.id}
                      href={`/product/${product.slug}`}
                      onClick={() => {
                        handleSearch(product.name);
                        setIsOpen(false);
                      }}
                      className="flex items-center space-x-3 p-3 hover:bg-gray-50 rounded-lg transition-colors"
                    >
                      {product.image ? (
                        <img src={product.image} alt={product.name} className="w-12 h-12 object-cover object-top rounded-lg" />
                      ) : (
                        <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
                          <i className="ri-image-line text-gray-300"></i>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 text-sm truncate">{product.name}</p>
                        <p className="text-xs text-gray-500">{product.category}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-gray-900 text-sm">GH₵ {product.price?.toFixed(2)}</p>
                        {product.compare_at_price && product.compare_at_price > product.price && (
                          <p className="text-xs text-gray-400 line-through">GH₵ {product.compare_at_price.toFixed(2)}</p>
                        )}
                      </div>
                    </Link>
                  ))}
                  <button
                    onClick={() => { handleSearch(query); setIsOpen(false); }}
                    className="w-full text-center p-3 text-sm font-medium text-gray-900 hover:bg-gray-50 rounded-lg transition-colors"
                  >
                    View all results for &ldquo;{query}&rdquo; →
                  </button>
                </div>
              )}
            </div>
          )}

          {/* No results */}
          {!loading && query.trim().length >= 2 && !hasResults && (
            <div className="p-8 text-center">
              <i className="ri-search-line text-4xl text-gray-300 mb-2"></i>
              <p className="text-gray-500 font-medium">No products found</p>
              <p className="text-sm text-gray-400 mt-1">Try different keywords</p>
            </div>
          )}

          {/* Recent searches */}
          {!query.trim() && recentSearches.length > 0 && (
            <div className="p-2">
              <div className="flex items-center justify-between px-3 py-2">
                <p className="text-xs font-semibold text-gray-500">Recent Searches</p>
                <button onClick={clearRecentSearches} className="text-xs text-gray-900 hover:text-gray-900 font-medium whitespace-nowrap">
                  Clear All
                </button>
              </div>
              {recentSearches.map((search, index) => (
                <button
                  key={index}
                  onClick={() => { setQuery(search); handleSearch(search); setIsOpen(false); }}
                  className="w-full flex items-center space-x-3 p-3 hover:bg-gray-50 rounded-lg transition-colors text-left"
                >
                  <i className="ri-history-line text-gray-400"></i>
                  <span className="flex-1 text-gray-700">{search}</span>
                  <i className="ri-arrow-right-up-line text-gray-400"></i>
                </button>
              ))}
            </div>
          )}

          {/* Popular tags */}
          {!query.trim() && recentSearches.length === 0 && (
            <div className="p-6">
              <p className="text-xs font-semibold text-gray-500 mb-3">Popular Searches</p>
              <div className="flex flex-wrap gap-2">
                {popularTags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => { setQuery(tag); handleSearch(tag); setIsOpen(false); }}
                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-full text-sm text-gray-700 transition-colors whitespace-nowrap"
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
