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

type Campaign = {
  active: boolean;
  type: 'percent' | 'fixed' | null;
  value: number | null;
  updated_at?: string | null;
};

const PERCENT_PRESETS = [10, 15, 20, 25, 30, 40, 50];
const FIXED_PRESETS = [5, 10, 15, 20, 30, 50, 100];

export default function DiscountsPage() {
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [discounted, setDiscounted] = useState<DiscountedProduct[]>([]);
  const [campaign, setCampaign] = useState<Campaign>({
    active: false,
    type: null,
    value: null,
  });
  const [loading, setLoading] = useState(true);
  const [loadingDiscounted, setLoadingDiscounted] = useState(true);
  const [toggling, setToggling] = useState(false);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [discountType, setDiscountType] = useState<'percent' | 'fixed'>('percent');
  const [discountValue, setDiscountValue] = useState<number>(10);
  const [customValue, setCustomValue] = useState('');
  const [applyAll, setApplyAll] = useState(false);
  const [applying, setApplying] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    fetchProducts();
    fetchDiscounted();
  }, []);

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
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  const fetchDiscounted = async () => {
    try {
      setLoadingDiscounted(true);
      const res = await fetch('/api/admin/discounts', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        // New shape: { campaign, products } — keep array fallback for safety
        if (Array.isArray(data)) {
          setDiscounted(data);
          setCampaign({ active: data.length > 0, type: null, value: null });
        } else {
          setDiscounted(Array.isArray(data.products) ? data.products : []);
          if (data.campaign) {
            setCampaign(data.campaign);
            if (data.campaign.type === 'percent' || data.campaign.type === 'fixed') {
              setDiscountType(data.campaign.type);
            }
            if (typeof data.campaign.value === 'number' && data.campaign.value > 0) {
              setDiscountValue(data.campaign.value);
              setCustomValue('');
            }
          }
        }
      }
    } catch {
      /* ignore */
    } finally {
      setLoadingDiscounted(false);
    }
  };

  const filteredProducts = useMemo(() => {
    const term = search.toLowerCase();
    return allProducts.filter(
      (p) =>
        p.name.toLowerCase().includes(term) ||
        (p.category && p.category.toLowerCase().includes(term)),
    );
  }, [allProducts, search]);

  const effectiveValue = discountValue || parseFloat(customValue) || 0;

  const previewProducts = useMemo(() => {
    if (effectiveValue <= 0) return [];
    const pool = applyAll
      ? filteredProducts
      : allProducts.filter((p) => selectedIds.has(p.id));
    return pool.map((p) => {
      const base =
        p.compare_at_price && p.compare_at_price > p.price
          ? p.compare_at_price
          : p.price;
      const newPrice =
        discountType === 'percent'
          ? +(base * (1 - effectiveValue / 100)).toFixed(2)
          : +(base - effectiveValue).toFixed(2);
      return { ...p, originalPrice: base, newPrice: Math.max(0, newPrice) };
    });
  }, [allProducts, filteredProducts, selectedIds, discountType, effectiveValue, applyAll]);

  const toggleProduct = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
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
    setTimeout(() => setMessage(null), 5000);
  };

  const toggleSale = async () => {
    const turningOff = campaign.active;
    if (turningOff) {
      const ok = confirm(
        'Turn OFF the store sale?\n\nThis will remove the discount and restore every product (and size) to its original price.',
      );
      if (!ok) return;
    }

    setToggling(true);
    try {
      const res = await fetch('/api/admin/discounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'toggle', active: !campaign.active }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      showMsg(json.message, 'success');
      if (json.campaign) setCampaign(json.campaign);
      fetchProducts();
      fetchDiscounted();
    } catch (err: any) {
      showMsg(err.message || 'Failed to toggle sale', 'error');
    } finally {
      setToggling(false);
    }
  };

  const applyDiscount = async () => {
    if (!campaign.active) {
      return showMsg('Turn the Sale toggle ON first, then apply the discount.', 'error');
    }
    if (!applyAll && selectedIds.size === 0) {
      return showMsg('Select products, or tick “Apply to all products”.', 'error');
    }
    if (effectiveValue <= 0) return showMsg('Enter a discount value.', 'error');

    setApplying(true);
    try {
      const res = await fetch('/api/admin/discounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          product_ids: applyAll ? [] : Array.from(selectedIds),
          all_products: applyAll,
          type: discountType,
          value: effectiveValue,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      showMsg(json.message, 'success');
      setSelectedIds(new Set());
      if (json.campaign) setCampaign(json.campaign);
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Discounts & Promotions</h1>
        <p className="text-gray-600 mt-1">
          Turn the sale ON, set the %, apply it — then turn the toggle OFF to restore original prices.
        </p>
      </div>

      {message && (
        <div
          className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium border ${
            message.type === 'success'
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          <i
            className={
              message.type === 'success'
                ? 'ri-check-double-line text-lg'
                : 'ri-error-warning-line text-lg'
            }
          />
          {message.text}
          <button
            onClick={() => setMessage(null)}
            className="ml-auto opacity-60 hover:opacity-100"
          >
            <i className="ri-close-line" />
          </button>
        </div>
      )}

      {/* ── Master Sale Toggle ── */}
      <div
        className={`rounded-2xl border-2 p-5 sm:p-6 shadow-sm transition-colors ${
          campaign.active
            ? 'border-emerald-400 bg-emerald-50'
            : 'border-gray-200 bg-white'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Store sale
            </p>
            <h2 className="text-xl font-bold text-gray-900 mt-1">
              {campaign.active ? 'Sale is ON' : 'Sale is OFF'}
            </h2>
            <p className="text-sm text-gray-600 mt-1 max-w-xl">
              {campaign.active
                ? campaign.value
                  ? `Active discount: ${
                      campaign.type === 'fixed' ? `GH₵${campaign.value} off` : `${campaign.value}% off`
                    }. Toggle OFF anytime to put every price back to normal.`
                  : 'Sale mode is on. Set a discount below and apply it to products.'
                : 'Prices are at regular amounts. Turn ON to start a store-wide sale.'}
            </p>
            {discounted.length > 0 && (
              <p className="text-sm font-medium text-emerald-800 mt-2">
                {discounted.length} product{discounted.length === 1 ? '' : 's'} currently on sale
              </p>
            )}
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={campaign.active}
            disabled={toggling}
            onClick={toggleSale}
            className={`relative inline-flex h-12 w-24 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-4 focus:ring-emerald-200 disabled:opacity-60 ${
              campaign.active ? 'bg-emerald-600' : 'bg-gray-300'
            }`}
          >
            <span
              className={`inline-block h-10 w-10 transform rounded-full bg-white shadow-md transition-transform ${
                campaign.active ? 'translate-x-12' : 'translate-x-1'
              }`}
            />
            <span className="sr-only">Toggle store sale</span>
          </button>
        </div>
        {toggling && (
          <p className="text-sm text-gray-500 mt-3 flex items-center gap-2">
            <i className="ri-loader-4-line animate-spin" />
            {campaign.active ? 'Restoring original prices…' : 'Turning sale on…'}
          </p>
        )}
      </div>

      {/* ── Apply Discount Section ── */}
      <div
        className={`bg-white rounded-xl border border-gray-200 shadow-sm ${
          !campaign.active ? 'opacity-60' : ''
        }`}
      >
        <div className="p-5 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-900">Set discount</h2>
          {!campaign.active && (
            <p className="text-sm text-amber-700 mt-1">
              Turn the Sale toggle ON before applying a discount.
            </p>
          )}
        </div>

        <div className="p-5 space-y-5">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setDiscountType('percent')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                discountType === 'percent'
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-700'
              }`}
            >
              Percentage %
            </button>
            <button
              type="button"
              onClick={() => setDiscountType('fixed')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                discountType === 'fixed'
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-700'
              }`}
            >
              Fixed GH₵
            </button>
          </div>

          <div className="flex flex-wrap gap-2 items-center">
            {(discountType === 'percent' ? PERCENT_PRESETS : FIXED_PRESETS).map((val) => (
              <button
                key={val}
                type="button"
                onClick={() => {
                  setDiscountValue(val);
                  setCustomValue('');
                }}
                className={`px-4 py-2 rounded-lg text-sm font-semibold border-2 transition-colors ${
                  discountValue === val && !customValue
                    ? 'border-gray-900 bg-gray-900 text-white'
                    : 'border-gray-300 text-gray-700 hover:border-gray-400'
                }`}
              >
                {discountType === 'percent' ? `${val}%` : `GH₵${val}`}
              </button>
            ))}
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={discountType === 'percent' ? 99 : 99999}
                placeholder="Custom"
                value={customValue}
                onChange={(e) => {
                  setCustomValue(e.target.value);
                  setDiscountValue(0);
                }}
                className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
              <span className="text-sm text-gray-500">
                {discountType === 'percent' ? '%' : 'GH₵'}
              </span>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm font-medium text-gray-800 cursor-pointer">
            <input
              type="checkbox"
              checked={applyAll}
              onChange={(e) => setApplyAll(e.target.checked)}
              className="rounded border-gray-300"
            />
            Apply to all active products (and their sizes)
          </label>

          {!applyAll && (
            <>
              <div className="flex items-center gap-3">
                <input
                  type="search"
                  placeholder="Search products…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
                <button
                  type="button"
                  onClick={selectAll}
                  className="text-sm font-semibold text-emerald-700 hover:underline"
                >
                  {selectedIds.size === filteredProducts.length
                    ? 'Clear selection'
                    : 'Select all shown'}
                </button>
              </div>

              <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-xl divide-y">
                {loading ? (
                  <div className="p-6 text-center text-gray-400">
                    <i className="ri-loader-4-line animate-spin text-2xl" />
                  </div>
                ) : (
                  filteredProducts.map((product) => {
                    const alreadyDiscounted =
                      product.compare_at_price && product.compare_at_price > product.price;
                    return (
                      <label
                        key={product.id}
                        className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedIds.has(product.id)}
                          onChange={() => toggleProduct(product.id)}
                        />
                        {product.image && (
                          <div className="relative w-9 h-9 rounded-lg overflow-hidden bg-gray-100 shrink-0">
                            <Image
                              src={product.image}
                              alt=""
                              fill
                              className="object-cover"
                              sizes="36px"
                            />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {product.name}
                          </p>
                          {alreadyDiscounted && (
                            <p className="text-[10px] text-amber-600 font-medium">
                              Already discounted
                            </p>
                          )}
                        </div>
                        <span className="text-sm text-gray-600">
                          GH₵{Number(product.price).toFixed(2)}
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
            </>
          )}

          {previewProducts.length > 0 && effectiveValue > 0 && (
            <p className="text-sm text-gray-600">
              Preview: {previewProducts.length} product
              {previewProducts.length === 1 ? '' : 's'} →{' '}
              <span className="font-semibold text-emerald-700">
                {discountType === 'percent'
                  ? `${effectiveValue}% off`
                  : `GH₵${effectiveValue} off`}
              </span>
            </p>
          )}

          <button
            type="button"
            onClick={applyDiscount}
            disabled={applying || !campaign.active || effectiveValue <= 0}
            className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-700 text-white rounded-xl font-semibold hover:bg-emerald-800 disabled:opacity-50"
          >
            {applying && <i className="ri-loader-4-line animate-spin" />}
            Apply{' '}
            {discountType === 'percent' ? `${effectiveValue}%` : `GH₵${effectiveValue}`} Discount
            {applyAll
              ? ' to All Products'
              : selectedIds.size
                ? ` to ${selectedIds.size} Product${selectedIds.size === 1 ? '' : 's'}`
                : ''}
          </button>
        </div>
      </div>

      {/* ── Currently Discounted ── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="p-5 border-b border-gray-200 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Currently Discounted</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {discounted.length} product{discounted.length !== 1 ? 's' : ''} on sale
            </p>
          </div>
          {discounted.length > 0 && (
            <button
              type="button"
              onClick={toggleSale}
              disabled={toggling || removing}
              className="px-4 py-2 border-2 border-red-300 text-red-700 rounded-lg text-sm font-semibold hover:bg-red-50 transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              <i className="ri-toggle-line" />
              Turn sale OFF & restore prices
            </button>
          )}
        </div>

        {loadingDiscounted ? (
          <div className="p-8 text-center text-gray-400">
            <i className="ri-loader-4-line animate-spin text-2xl" />
          </div>
        ) : discounted.length === 0 ? (
          <div className="p-10 text-center">
            <i className="ri-price-tag-3-line text-4xl text-gray-300 mb-3 block" />
            <p className="text-gray-500 font-medium">No active discounts</p>
            <p className="text-xs text-gray-400 mt-1">
              Turn the Sale toggle ON, set a %, and apply it.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-600 uppercase">
                    Product
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-600 uppercase">
                    Original
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-600 uppercase">
                    Discount
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-600 uppercase">
                    Sale price
                  </th>
                  <th className="text-right py-3 px-4 text-xs font-semibold text-gray-600 uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {discounted.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        {item.image && (
                          <div className="relative w-10 h-10 rounded-lg overflow-hidden bg-gray-100 border border-gray-200 shrink-0">
                            <Image
                              src={item.image}
                              alt=""
                              fill
                              className="object-cover"
                              sizes="40px"
                            />
                          </div>
                        )}
                        <span className="text-sm font-medium text-gray-900 truncate max-w-[200px]">
                          {item.name}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-500 line-through">
                      GH₵{item.original_price.toFixed(2)}
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700">
                        -{item.discount_percent}% (GH₵{item.discount_amount.toFixed(2)})
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm font-bold text-green-700">
                      GH₵{item.price.toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
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
