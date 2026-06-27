'use client';

import { useState, useEffect, useMemo } from 'react';
import Image from 'next/image';

type Product = {
  id: string;
  name: string;
  price: number;
  compare_at_price: number | null;
  status: string;
  image: string | null;
  category: string | null;
};

type DiscountedProduct = {
  id: string;
  name: string;
  price: number;
  original_price: number;
  discount_amount: number;
  discount_percent: number;
  status: string;
  image: string | null;
};

const PERCENT_PRESETS = [10, 15, 20, 25, 30, 40, 50];
const FIXED_PRESETS = [5, 10, 15, 20, 30, 50, 100];

export default function DiscountsPage() {
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [discounted, setDiscounted] = useState<DiscountedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingDiscounted, setLoadingDiscounted] = useState(true);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [discountType, setDiscountType] = useState<'percent' | 'fixed'>('percent');
  const [discountValue, setDiscountValue] = useState<number>(0);
  const [customValue, setCustomValue] = useState('');
  const [applying, setApplying] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => { fetchProducts(); fetchDiscounted(); }, []);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/products', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setAllProducts(
          (Array.isArray(data) ? data : []).map((p: any) => ({
            id: p.id,
            name: p.name,
            price: p.price,
            compare_at_price: p.compare_at_price || null,
            status: p.status,
            image: p.image || null,
            category: p.category || null,
          })),
        );
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  const fetchDiscounted = async () => {
    try {
      setLoadingDiscounted(true);
      const res = await fetch('/api/admin/discounts', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setDiscounted(Array.isArray(data) ? data : []);
      }
    } catch { /* ignore */ }
    finally { setLoadingDiscounted(false); }
  };

  const filteredProducts = useMemo(() => {
    const term = search.toLowerCase();
    return allProducts.filter(
      (p) => p.name.toLowerCase().includes(term) || (p.category && p.category.toLowerCase().includes(term)),
    );
  }, [allProducts, search]);

  const effectiveValue = discountValue || parseFloat(customValue) || 0;

  const previewProducts = useMemo(() => {
    if (effectiveValue <= 0 || selectedIds.size === 0) return [];
    return allProducts
      .filter((p) => selectedIds.has(p.id))
      .map((p) => {
        const base = p.compare_at_price && p.compare_at_price > p.price ? p.compare_at_price : p.price;
        const newPrice =
          discountType === 'percent'
            ? +(base * (1 - effectiveValue / 100)).toFixed(2)
            : +(base - effectiveValue).toFixed(2);
        return { ...p, originalPrice: base, newPrice: Math.max(0, newPrice) };
      });
  }, [allProducts, selectedIds, discountType, effectiveValue]);

  const toggleProduct = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === filteredProducts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredProducts.map((p) => p.id)));
    }
  };

  const showMsg = (text: string, type: 'success' | 'error') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 4000);
  };

  const applyDiscount = async () => {
    if (selectedIds.size === 0) return showMsg('Select at least one product.', 'error');
    if (effectiveValue <= 0) return showMsg('Enter a discount value.', 'error');

    setApplying(true);
    try {
      const res = await fetch('/api/admin/discounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          product_ids: Array.from(selectedIds),
          type: discountType,
          value: effectiveValue,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      showMsg(json.message, 'success');
      setSelectedIds(new Set());
      setDiscountValue(0);
      setCustomValue('');
      fetchProducts();
      fetchDiscounted();
    } catch (err: any) {
      showMsg(err.message || 'Failed to apply discount', 'error');
    } finally {
      setApplying(false);
    }
  };

  const removeDiscount = async (productIds: string[]) => {
    setRemoving(true);
    try {
      const res = await fetch('/api/admin/discounts', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ product_ids: productIds }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      showMsg(json.message, 'success');
      fetchProducts();
      fetchDiscounted();
    } catch (err: any) {
      showMsg(err.message || 'Failed to remove discount', 'error');
    } finally {
      setRemoving(false);
    }
  };

  const removeAllDiscounts = async () => {
    if (!confirm('Remove ALL discounts and restore original prices?')) return;
    setRemoving(true);
    try {
      const res = await fetch('/api/admin/discounts', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ all: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      showMsg(json.message, 'success');
      fetchProducts();
      fetchDiscounted();
    } catch (err: any) {
      showMsg(err.message || 'Failed to remove discounts', 'error');
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Discounts & Promotions</h1>
        <p className="text-gray-600 mt-1">Select products and apply percentage or fixed amount discounts</p>
      </div>

      {message && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium border ${message.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
          <i className={message.type === 'success' ? 'ri-check-double-line text-lg' : 'ri-error-warning-line text-lg'} />
          {message.text}
          <button onClick={() => setMessage(null)} className="ml-auto opacity-60 hover:opacity-100"><i className="ri-close-line" /></button>
        </div>
      )}

      {/* ── Apply Discount Section ── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="p-5 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-900">Apply New Discount</h2>
        </div>

        {/* Step 1: Discount type & value */}
        <div className="p-5 border-b border-gray-100 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => { setDiscountType('percent'); setDiscountValue(0); setCustomValue(''); }}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${discountType === 'percent' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'}`}
              >
                <i className="ri-percent-line mr-1.5" />
                Percentage Off
              </button>
              <button
                onClick={() => { setDiscountType('fixed'); setDiscountValue(0); setCustomValue(''); }}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${discountType === 'fixed' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'}`}
              >
                <i className="ri-money-cedi-circle-line mr-1.5" />
                Fixed Amount Off
              </button>
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">Quick presets</p>
            <div className="flex flex-wrap gap-2">
              {(discountType === 'percent' ? PERCENT_PRESETS : FIXED_PRESETS).map((val) => (
                <button
                  key={val}
                  onClick={() => { setDiscountValue(val); setCustomValue(''); }}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold border-2 transition-colors ${discountValue === val && !customValue ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-300 text-gray-700 hover:border-gray-400'}`}
                >
                  {discountType === 'percent' ? `${val}%` : `GH₵${val}`}
                </button>
              ))}
              <div className="relative">
                <input
                  type="number"
                  min="1"
                  max={discountType === 'percent' ? 99 : 99999}
                  step="any"
                  value={customValue}
                  onChange={(e) => { setCustomValue(e.target.value); setDiscountValue(0); }}
                  placeholder="Custom"
                  className="w-28 px-3 py-2 border-2 border-gray-300 rounded-lg text-sm font-semibold focus:ring-2 focus:ring-gray-600 focus:border-gray-600"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                  {discountType === 'percent' ? '%' : 'GH₵'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Step 2: Select products */}
        <div className="p-5 border-b border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold text-gray-900">
              Select Products
              {selectedIds.size > 0 && (
                <span className="ml-2 text-xs font-medium text-brand-orange">({selectedIds.size} selected)</span>
              )}
            </p>
            <button onClick={selectAll} className="text-xs text-brand-greenDark hover:underline font-medium">
              {selectedIds.size === filteredProducts.length && filteredProducts.length > 0 ? 'Deselect all' : 'Select all'}
            </button>
          </div>

          <div className="relative mb-3">
            <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products by name or category..."
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-600 focus:border-gray-600"
            />
          </div>

          <div className="max-h-72 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
            {loading ? (
              <div className="p-6 text-center text-gray-400"><i className="ri-loader-4-line animate-spin text-xl" /></div>
            ) : filteredProducts.length === 0 ? (
              <div className="p-6 text-center text-gray-400 text-sm">No products found</div>
            ) : (
              filteredProducts.map((product) => {
                const isSelected = selectedIds.has(product.id);
                const alreadyDiscounted = product.compare_at_price && product.compare_at_price > product.price;
                return (
                  <label
                    key={product.id}
                    className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-gray-50 transition-colors ${isSelected ? 'bg-brand-greenLight/30' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleProduct(product.id)}
                      className="w-4 h-4 text-gray-900 border-gray-300 rounded focus:ring-gray-600 shrink-0"
                    />
                    {product.image && (
                      <div className="relative w-10 h-10 rounded-lg overflow-hidden bg-gray-100 shrink-0 border border-gray-200">
                        <Image src={product.image} alt="" fill className="object-cover" sizes="40px" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{product.name}</p>
                      {product.category && <p className="text-xs text-gray-400 truncate">{product.category}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-gray-900">GH₵{product.price.toFixed(2)}</p>
                      {alreadyDiscounted && (
                        <p className="text-[10px] text-amber-600 font-medium">Already discounted</p>
                      )}
                    </div>
                  </label>
                );
              })
            )}
          </div>
        </div>

        {/* Step 3: Preview */}
        {previewProducts.length > 0 && (
          <div className="p-5 border-b border-gray-100">
            <p className="text-sm font-bold text-gray-900 mb-2">
              <i className="ri-eye-line mr-1" /> Preview ({previewProducts.length} products)
            </p>
            <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
              {previewProducts.map((p) => (
                <div key={p.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span className="text-gray-700 truncate flex-1">{p.name}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-gray-400 line-through text-xs">GH₵{p.originalPrice.toFixed(2)}</span>
                    <span className="font-bold text-green-700">GH₵{p.newPrice.toFixed(2)}</span>
                    <span className="text-[10px] font-bold bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">
                      {discountType === 'percent' ? `-${effectiveValue}%` : `-GH₵${effectiveValue}`}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Apply button */}
        <div className="p-5 flex items-center gap-3">
          <button
            onClick={applyDiscount}
            disabled={applying || selectedIds.size === 0 || effectiveValue <= 0}
            className="px-6 py-3 bg-gray-900 text-white rounded-lg font-semibold hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
          >
            {applying && <i className="ri-loader-4-line animate-spin mr-2" />}
            Apply Discount to {selectedIds.size} Product{selectedIds.size !== 1 ? 's' : ''}
          </button>
          {selectedIds.size > 0 && (
            <button onClick={() => setSelectedIds(new Set())} className="text-sm text-gray-500 hover:text-gray-700 font-medium">
              Clear selection
            </button>
          )}
        </div>
      </div>

      {/* ── Currently Discounted Products ── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="p-5 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Currently Discounted</h2>
            <p className="text-xs text-gray-500 mt-0.5">{discounted.length} product{discounted.length !== 1 ? 's' : ''} on sale</p>
          </div>
          {discounted.length > 0 && (
            <button
              onClick={removeAllDiscounts}
              disabled={removing}
              className="px-4 py-2 border-2 border-red-300 text-red-700 rounded-lg text-sm font-semibold hover:bg-red-50 transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              {removing && <i className="ri-loader-4-line animate-spin" />}
              <i className="ri-refresh-line" />
              Restore All Original Prices
            </button>
          )}
        </div>

        {loadingDiscounted ? (
          <div className="p-8 text-center text-gray-400"><i className="ri-loader-4-line animate-spin text-2xl" /></div>
        ) : discounted.length === 0 ? (
          <div className="p-10 text-center">
            <i className="ri-price-tag-3-line text-4xl text-gray-300 mb-3 block" />
            <p className="text-gray-500 font-medium">No active discounts</p>
            <p className="text-xs text-gray-400 mt-1">Select products above and apply a discount to get started.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-600 uppercase">Product</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-600 uppercase">Original Price</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-600 uppercase">Discount</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-600 uppercase">Sale Price</th>
                  <th className="text-right py-3 px-4 text-xs font-semibold text-gray-600 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {discounted.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        {item.image && (
                          <div className="relative w-10 h-10 rounded-lg overflow-hidden bg-gray-100 border border-gray-200 shrink-0">
                            <Image src={item.image} alt="" fill className="object-cover" sizes="40px" />
                          </div>
                        )}
                        <span className="text-sm font-medium text-gray-900 truncate max-w-[200px]">{item.name}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-500 line-through">GH₵{item.original_price.toFixed(2)}</td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700">
                        -{item.discount_percent}% (GH₵{item.discount_amount.toFixed(2)})
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm font-bold text-green-700">GH₵{item.price.toFixed(2)}</td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => removeDiscount([item.id])}
                        disabled={removing}
                        className="text-xs text-red-600 hover:text-red-800 font-semibold hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                      >
                        Restore Price
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
