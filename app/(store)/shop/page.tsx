'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { usePageTitle } from '@/hooks/usePageTitle';
import ProductCard, { type ColorVariant } from '@/components/ProductCard';
import { getColorHex } from '@/components/ProductCard';
import { supabase } from '@/lib/supabase';
import { cachedQuery } from '@/lib/query-cache';

function ShopContent() {
  usePageTitle('Shop Kids Ready-to-Wear Outfits');
  const searchParams = useSearchParams();

  // State
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([{ id: 'all', name: 'All Products', count: 0 }]);
  const [loading, setLoading] = useState(true);
  const [totalProducts, setTotalProducts] = useState(0);

  // Filters
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedAge, setSelectedAge] = useState('');
  const [priceRange, setPriceRange] = useState([0, 5000]);
  const [selectedRating, setSelectedRating] = useState(0);
  const [sortBy, setSortBy] = useState('popular');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [page, setPage] = useState(1);
  const productsPerPage = 9;

  const ageOptions = ['6 months', 'Age 1', 'Age 2', 'Age 3', 'Age 4', 'Age 5', 'Age 6', 'Age 7', 'Age 8', 'Age 9', 'Age 10', 'Age 11', 'Age 12'];

  // Initialize from URL params
  useEffect(() => {
    const category = searchParams.get('category');
    const sort = searchParams.get('sort');
    const search = searchParams.get('search');
    const age = searchParams.get('age');

    if (category) setSelectedCategory(category);
    if (sort) setSortBy(sort);
    if (age) setSelectedAge(age);
  }, [searchParams]);

  // Fetch Categories from cached API
  useEffect(() => {
    async function fetchCategories() {
      try {
        const res = await fetch('/api/storefront/categories');
        if (res.ok) {
          const data = await res.json();
          if (data) setCategories(data);
        }
      } catch (err) {
        console.error('Error fetching categories:', err);
      }
    }
    fetchCategories();
  }, []);

  // Fetch Products
  useEffect(() => {
    async function fetchProducts() {
      setLoading(true);
      try {
        const search = searchParams.get('search');

        const cacheKey = `shop:${selectedCategory}:${selectedAge}:${search}:${priceRange.join('-')}:${selectedRating}:${sortBy}:${page}`;
        const { data, count, error } = await cachedQuery<{ data: any; count: any; error: any }>(
          cacheKey,
          async () => {
            let query = supabase
              .from('products')
              .select(`
                *,
                categories!inner(name, slug),
                product_images!product_id(url, position),
                product_variants!left(id, name, price, quantity, option1, option2, image_url)
              `, { count: 'exact' })
              .order('position', { foreignTable: 'product_images', ascending: true });

            if (search) {
              query = query.ilike('name', `%${search}%`);
            }

            if (selectedCategory !== 'all') {
              const categoryObj = categories.find(c => c.slug === selectedCategory);

              if (categoryObj) {
                const targetSlugs = [selectedCategory];
                const childSlugs = categories
                  .filter(c => c.parent_id === categoryObj.id)
                  .map(c => c.slug);
                targetSlugs.push(...childSlugs);
                query = query.in('categories.slug', targetSlugs);
              } else {
                query = query.eq('categories.slug', selectedCategory);
              }
            }

            if (priceRange[1] < 5000) {
              query = query.gte('price', priceRange[0]).lte('price', priceRange[1]);
            }

            if (selectedRating > 0) {
              query = query.gte('rating_avg', selectedRating);
            }

            switch (sortBy) {
              case 'price-low':
                query = query.order('price', { ascending: true });
                break;
              case 'price-high':
                query = query.order('price', { ascending: false });
                break;
              case 'rating':
                query = query.order('rating_avg', { ascending: false });
                break;
              case 'new':
                query = query.order('created_at', { ascending: false });
                break;
              case 'popular':
              default:
                query = query.order('created_at', { ascending: false });
                break;
            }

            const fetchSize = selectedAge ? 100 : productsPerPage;
            const from = (page - 1) * fetchSize;
            const to = from + fetchSize - 1;
            query = query.range(from, to);

            return query as any;
          },
          2 * 60 * 1000
        );

        if (error) throw error;

        if (data) {
          let filtered = data;
          if (selectedAge) {
            filtered = data.filter((p: any) => {
              const variants = p.product_variants || [];
              return variants.some((v: any) => {
                const vName = (v.name || v.option1 || '').toLowerCase().trim();
                const target = selectedAge.toLowerCase().trim();
                return vName === target && (v.quantity || 0) > 0;
              });
            });
          }
          const formattedProducts = filtered.map((p: any) => {
            const variants = p.product_variants || [];
            const hasVariants = variants.length > 0;
            const minVariantPrice = hasVariants ? Math.min(...variants.map((v: any) => v.price || p.price)) : undefined;
            const totalVariantStock = hasVariants ? variants.reduce((sum: number, v: any) => sum + (v.quantity || 0), 0) : 0;
            const effectiveStock = hasVariants ? totalVariantStock : p.quantity;
            const colorVariants: ColorVariant[] = [];
            const seenColors = new Set<string>();
            for (const v of variants) {
              const colorName = v.option2;
              if (colorName && !seenColors.has(colorName.toLowerCase().trim())) {
                const hex = getColorHex(colorName);
                if (hex) {
                  seenColors.add(colorName.toLowerCase().trim());
                  colorVariants.push({ name: colorName.trim(), hex });
                }
              }
            }
            return {
              id: p.id,           // Product UUID for cart/orders
              slug: p.slug,       // Slug for navigation
              name: p.name,
              price: p.price,
              originalPrice: p.compare_at_price,
              image: p.product_images?.[0]?.url || 'https://via.placeholder.com/800x800?text=No+Image',
              rating: p.rating_avg || 0,
              reviewCount: 0, // Need to implement reviews relation
              badge: p.compare_at_price > p.price ? 'Sale' : undefined,
              inStock: effectiveStock > 0,
              maxStock: effectiveStock || 50,
              moq: p.moq || 1,
              category: p.categories?.name,
              hasVariants,
              minVariantPrice,
              colorVariants,
            };
          });
          setProducts(formattedProducts);
          setTotalProducts(selectedAge ? formattedProducts.length : (count || 0));
        }
      } catch (err) {
        console.error('Error fetching products:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchProducts();
  }, [selectedCategory, selectedAge, priceRange, selectedRating, sortBy, page, searchParams, categories]);

  const totalPages = Math.ceil(totalProducts / productsPerPage);

  return (
    <main className="min-h-screen bg-gradient-to-b from-brand-greenLight/40 via-white to-white">
      <section className="relative overflow-hidden border-b border-brand-green/25">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(42,181,42,0.35),transparent_45%),radial-gradient(circle_at_85%_10%,rgba(248,119,26,0.2),transparent_40%),linear-gradient(130deg,#1f8c1f,#2AB52A,#1F8C1F)]" />
        <div className="absolute inset-0 bg-black/20" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-16 md:py-20 text-white">
          <div className="max-w-3xl">
            <span className="inline-flex items-center rounded-full border border-white/30 bg-white/10 px-4 py-1.5 text-[11px] font-semibold tracking-[0.2em] uppercase">
              Freby’s Fashion GH
            </span>
            <h1 className="mt-4 text-3xl sm:text-4xl md:text-5xl font-extrabold leading-tight">
              Shop Kids Ready-to-Wear Outfits
            </h1>
            <p className="mt-4 text-sm sm:text-base text-white/90 max-w-2xl">
              Unique kids ready-to-wear outfits for all occasions.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3 text-xs sm:text-sm text-white/90">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 border border-white/20">
                <i className="ri-map-pin-line" /> Haatso, Accra, Ghana
              </span>
              <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 border border-white/20">
                <i className="ri-earth-line" /> Worldwide delivery
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Mobile Filter Toggle */}
      <div className="lg:hidden bg-white/95 backdrop-blur-md border-b border-brand-green/20 py-4 px-4 sticky top-[72px] z-20">
        <div className="flex justify-between items-center">
          <button
            onClick={() => setIsFilterOpen(!isFilterOpen)}
            className="inline-flex items-center space-x-2 text-brand-greenDark font-semibold"
          >
            <i className="ri-filter-3-line text-xl"></i>
            <span>Filters & Sort</span>
          </button>
          <span className="text-sm text-brand-greenDark">{totalProducts} Products</span>
        </div>
      </div>

      <section className="py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex gap-8">
            <aside className={`${isFilterOpen ? 'fixed inset-0 z-50 bg-white overflow-y-auto' : 'hidden'} lg:block lg:w-72 lg:flex-shrink-0`}>
              <div className="lg:sticky lg:top-24">
                <div className="bg-white lg:bg-brand-greenLight/55 lg:border lg:border-brand-green/20 lg:rounded-3xl p-6">
                  <div className="flex items-center justify-between mb-6 lg:hidden">
                    <h2 className="text-xl font-bold text-brand-greenDark">Filters</h2>
                    <button
                      onClick={() => setIsFilterOpen(false)}
                      className="w-10 h-10 flex items-center justify-center text-brand-greenDark"
                    >
                      <i className="ri-close-line text-2xl"></i>
                    </button>
                  </div>

                  <div className="space-y-8">
                    {/* Categories */}
                    <div>
                      <h3 className="font-semibold text-brand-greenDark mb-4">Categories</h3>
                      <div className="space-y-1">
                        <button
                          onClick={() => {
                            setSelectedCategory('all');
                            setPage(1);
                            setIsFilterOpen(false);
                          }}
                          className={`w-full text-left px-4 py-2 rounded-lg transition-colors ${selectedCategory === 'all'
                            ? 'bg-brand-greenLight text-brand-greenDark font-medium'
                            : 'text-gray-700 hover:bg-gray-100'
                            }`}
                        >
                          All Products
                        </button>

                        {/* Parent Categories */}
                        {categories.filter(c => !c.parent_id && c.id !== 'all').map(parent => {
                          const subcategories = categories.filter(c => c.parent_id === parent.id);
                          const isSelected = selectedCategory === parent.slug;
                          const isChildSelected = subcategories.some(sub => sub.slug === selectedCategory);
                          const isOpen = isSelected || isChildSelected; // Auto-expand if selected

                          return (
                            <div key={parent.id} className="space-y-1">
                              <button
                                onClick={() => {
                                  setSelectedCategory(parent.slug);
                                  setPage(1);
                                }}
                                className={`w-full text-left px-4 py-2 rounded-lg transition-colors flex justify-between items-center ${isSelected
                                  ? 'bg-brand-greenLight text-brand-greenDark font-medium'
                                  : 'text-gray-700 hover:bg-gray-100'
                                  }`}
                              >
                                <span>{parent.name}</span>
                              </button>

                              {/* Subcategories */}
                              {subcategories.length > 0 && (
                                <div className="ml-4 border-l-2 border-gray-100 pl-2 space-y-1">
                                  {subcategories.map(child => (
                                    <button
                                      key={child.id}
                                      onClick={() => {
                                        setSelectedCategory(child.slug);
                                        setPage(1);
                                        setIsFilterOpen(false);
                                      }}
                                      className={`w-full text-left px-4 py-1.5 rounded-lg text-sm transition-colors ${selectedCategory === child.slug
                                        ? 'text-brand-greenDark font-medium bg-brand-greenLight'
                                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                                        }`}
                                    >
                                      {child.name}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Price Range */}
                    <div className="border-t border-brand-green/20 pt-8">
                      <h3 className="font-semibold text-brand-greenDark mb-4">Max Price: GH₵{priceRange[1]}</h3>
                      <div className="space-y-4">
                        <input
                          type="range"
                          min="0"
                          max="5000"
                          step="50"
                          value={priceRange[1]}
                          onChange={(e) => {
                            setPriceRange([0, parseInt(e.target.value)]);
                            setPage(1);
                          }}
                          className="w-full h-2 bg-brand-greenLight rounded-lg appearance-none cursor-pointer accent-brand-greenDark"
                        />
                        <div className="flex items-center justify-between text-sm text-brand-greenDark/80">
                          <span>GH₵0</span>
                          <span>GH₵5000+</span>
                        </div>
                      </div>
                    </div>

                    {/* Rating */}
                    <div className="border-t border-brand-green/20 pt-8">
                      <h3 className="font-semibold text-brand-greenDark mb-4">Rating</h3>
                      <div className="space-y-2">
                        {[4, 3, 2, 1].map(rating => (
                          <button
                            key={rating}
                            onClick={() => {
                              setSelectedRating(rating === selectedRating ? 0 : rating);
                              setPage(1);
                            }}
                            className={`w-full text-left px-4 py-2 rounded-lg transition-colors ${selectedRating === rating
                              ? 'bg-brand-greenLight text-brand-greenDark'
                              : 'text-gray-700 hover:bg-gray-100'
                              }`}
                          >
                            <div className="flex items-center space-x-2">
                              {[1, 2, 3, 4, 5].map(star => (
                                <i
                                  key={star}
                                  className={`${star <= rating ? 'ri-star-fill text-brand-orange' : 'ri-star-line text-gray-300'} text-sm`}
                                ></i>
                              ))}
                              <span className="text-sm">& Up</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        setIsFilterOpen(false);
                      }}
                      className="w-full bg-brand-green hover:bg-brand-greenDark text-white py-3 rounded-xl font-semibold transition-colors whitespace-nowrap"
                    >
                      Show Results
                    </button>
                  </div>
                </div>
              </div>
            </aside>

            <div className="flex-1">
              <div className="mb-8 rounded-2xl border border-brand-green/20 bg-white p-4 sm:p-5 shadow-sm">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div>
                    <p className="text-brand-greenDark text-xs font-semibold tracking-[0.2em] uppercase">Collection View</p>
                    <p className="mt-1 text-gray-700">
                      Showing <span className="font-bold text-brand-greenDark">{products.length}</span> of <span className="font-bold text-brand-greenDark">{totalProducts}</span> products
                    </p>
                  </div>

                  <div className="flex items-center space-x-3">
                    <label className="text-sm text-gray-600 whitespace-nowrap">Sort by:</label>
                    <select
                      value={sortBy}
                      onChange={(e) => {
                        setSortBy(e.target.value);
                        setPage(1);
                      }}
                      className="px-4 py-2 pr-8 border border-brand-green/30 rounded-xl focus:ring-2 focus:ring-brand-green focus:border-brand-green text-sm bg-white cursor-pointer"
                    >
                      <option value="popular">Most Popular</option>
                      <option value="new">Newest</option>
                      <option value="price-low">Price: Low to High</option>
                      <option value="price-high">Price: High to Low</option>
                      <option value="rating">Highest Rated</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Age Filter Chips */}
              <div className="mb-6 rounded-2xl border border-brand-green/20 bg-white p-4 shadow-sm">
                <div className="flex items-center gap-3 mb-3">
                  <i className="ri-user-heart-line text-lg text-brand-greenDark"></i>
                  <h3 className="text-sm font-bold text-brand-greenDark tracking-wide">Shop by Age</h3>
                  {selectedAge && (
                    <button
                      onClick={() => { setSelectedAge(''); setPage(1); }}
                      className="ml-auto text-xs text-gray-500 hover:text-red-600 font-medium flex items-center gap-1"
                    >
                      <i className="ri-close-line"></i> Clear
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {ageOptions.map(age => {
                    const isActive = selectedAge === age;
                    const label = age.replace('Age ', '');
                    return (
                      <button
                        key={age}
                        onClick={() => { setSelectedAge(isActive ? '' : age); setPage(1); }}
                        className={`px-4 py-2 rounded-full text-sm font-semibold border-2 transition-all ${
                          isActive
                            ? 'border-brand-green bg-brand-green text-white shadow-sm'
                            : 'border-brand-green/25 bg-brand-greenLight/40 text-brand-greenDark hover:border-brand-green hover:bg-brand-greenLight'
                        }`}
                      >
                        {age === '6 months' ? '6m' : label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {loading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="rounded-2xl border border-brand-green/20 bg-white p-3">
                      <div className="bg-brand-greenLight rounded-xl aspect-[4/5] animate-pulse"></div>
                      <div className="mt-3 h-4 w-3/4 rounded bg-brand-green/20 animate-pulse"></div>
                      <div className="mt-2 h-4 w-1/2 rounded bg-brand-green/20 animate-pulse"></div>
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6" data-product-shop>
                    {products.map(product => (
                      <ProductCard key={product.id} {...product} />
                    ))}
                  </div>

                  {products.length === 0 && (
                    <div className="text-center py-20 px-6 mt-4 rounded-3xl border border-brand-green/20 bg-brand-greenLight/40">
                      <div className="w-20 h-20 flex items-center justify-center mx-auto mb-6 bg-white rounded-full border border-brand-green/20 shadow-sm">
                        <i className="ri-inbox-line text-4xl text-brand-green"></i>
                      </div>
                      <h3 className="text-2xl font-bold text-brand-greenDark mb-2">No Products Found</h3>
                      <p className="text-brand-greenDark/80 mb-8">Try adjusting your filters to discover more unique kids outfits</p>
                      <button
                        onClick={() => {
                          setSelectedCategory('all');
                          setSelectedAge('');
                          setPriceRange([0, 5000]);
                          setSelectedRating(0);
                          setPage(1);
                        }}
                        className="inline-flex items-center bg-brand-green hover:bg-brand-greenDark text-white px-6 py-3 rounded-xl font-semibold transition-colors whitespace-nowrap"
                      >
                        Clear All Filters
                      </button>
                    </div>
                  )}
                </>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="mt-16 flex justify-center">
                  <div className="inline-flex items-center space-x-2 rounded-2xl border border-brand-green/20 bg-white px-3 py-2 shadow-sm">
                    <button
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="w-10 h-10 flex items-center justify-center border border-brand-green/30 rounded-lg hover:bg-brand-greenLight transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <i className="ri-arrow-left-s-line text-xl text-brand-greenDark"></i>
                    </button>

                    <span className="px-4 font-medium text-brand-greenDark">
                      Page {page} of {totalPages}
                    </span>

                    <button
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      className="w-10 h-10 flex items-center justify-center border border-brand-green/30 rounded-lg hover:bg-brand-greenLight transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <i className="ri-arrow-right-s-line text-xl text-brand-greenDark"></i>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

export default function ShopPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="w-12 h-12 border-4 border-gray-900 border-t-transparent rounded-full animate-spin"></div></div>}>
      <ShopContent />
    </Suspense>
  );
}