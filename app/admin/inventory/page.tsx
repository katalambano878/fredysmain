'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

// ─── Types ──────────────────────────────────────────────────────────────────

interface VariantRow {
    id: string;
    name: string;
    option1: string | null;
    option2: string | null;
    quantity: number;
    price: number;
}

interface ProductRow {
    id: string;
    name: string;
    sku: string;
    category: string;
    categoryId: string | null;
    productQuantity: number;
    price: number;
    status: string; // products.status (active/draft/archived…)
    gender: 'male' | 'female' | 'unisex';
    variants: VariantRow[];
}

type StockStatus = 'good' | 'low' | 'out';
type StockFilter = 'all' | 'good' | 'low' | 'out';
type GenderFilter = 'all' | 'male' | 'female';

const LOW_STOCK_THRESHOLD = 10;

function classifyStock(qty: number): StockStatus {
    if (qty <= 0) return 'out';
    if (qty < LOW_STOCK_THRESHOLD) return 'low';
    return 'good';
}

function statusBadge(status: StockStatus) {
    if (status === 'good') {
        return (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap">
                <i className="ri-checkbox-circle-fill" />
                In Stock
            </span>
        );
    }
    if (status === 'low') {
        return (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 whitespace-nowrap">
                <i className="ri-alert-fill" />
                Low Stock
            </span>
        );
    }
    return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200 whitespace-nowrap">
            <i className="ri-close-circle-fill" />
            Out
        </span>
    );
}

/**
 * Sort variant labels naturally: "Age 1, Age 2, Age 10..." instead of
 * lexicographic "Age 1, Age 10, Age 11, Age 2..."
 */
function variantLabelCompare(a: string, b: string): number {
    const numA = parseFloat(a.match(/\d+/)?.[0] || '');
    const numB = parseFloat(b.match(/\d+/)?.[0] || '');
    const aHasNum = !Number.isNaN(numA);
    const bHasNum = !Number.isNaN(numB);
    if (aHasNum && bHasNum && a.replace(/\d+/g, '') === b.replace(/\d+/g, '')) {
        return numA - numB;
    }
    return a.localeCompare(b);
}

export default function InventoryManagementPage() {
    const [products, setProducts] = useState<ProductRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [searchTerm, setSearchTerm] = useState('');
    const [stockFilter, setStockFilter] = useState<StockFilter>('all');
    const [categoryFilter, setCategoryFilter] = useState<string>('all');
    const [colorFilter, setColorFilter] = useState<string>('all');
    const [variantFilter, setVariantFilter] = useState<string>('all');
    const [genderFilter, setGenderFilter] = useState<GenderFilter>('all');

    const [expanded, setExpanded] = useState<Record<string, boolean>>({});
    const [selectedProducts, setSelectedProducts] = useState<string[]>([]);

    useEffect(() => {
        fetchInventory();
    }, []);

    async function fetchInventory() {
        try {
            setLoading(true);
            setError(null);
            const { data, error: dbError } = await supabase
                .from('products')
                .select(`
                    id,
                    name,
                    sku,
                    price,
                    quantity,
                    status,
                    gender,
                    category_id,
                    categories(name),
                    product_variants(id, name, option1, option2, quantity, price, sort_order)
                `)
                .eq('status', 'active')
                .order('name');

            if (dbError) throw dbError;

            const rows: ProductRow[] = (data || []).map((p: any) => {
                const rawVariants: any[] = Array.isArray(p.product_variants) ? p.product_variants : [];
                const variants: VariantRow[] = [...rawVariants]
                    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
                    .map((v) => ({
                        id: v.id,
                        name: v.name || 'Variant',
                        option1: v.option1 ?? null,
                        option2: v.option2 ?? null,
                        quantity: Number(v.quantity ?? 0) || 0,
                        price: Number(v.price ?? p.price ?? 0) || 0,
                    }));
                return {
                    id: p.id,
                    name: p.name,
                    sku: p.sku || 'N/A',
                    category: p.categories?.name || 'Uncategorized',
                    categoryId: p.category_id || null,
                    productQuantity: Number(p.quantity ?? 0) || 0,
                    price: Number(p.price ?? 0) || 0,
                    status: p.status || 'active',
                    gender: (p.gender === 'male' || p.gender === 'female') ? p.gender : 'unisex',
                    variants,
                };
            });

            setProducts(rows);
        } catch (err: any) {
            console.error('[Inventory] Error:', err);
            setError(err?.message || 'Failed to fetch inventory');
        } finally {
            setLoading(false);
        }
    }

    // ─── Derived: aggregates and option lists ──────────────────────────────

    /** A product's effective stock: sum of variants if any, else product.quantity */
    function effectiveStock(p: ProductRow): number {
        if (p.variants.length === 0) return p.productQuantity;
        return p.variants.reduce((s, v) => s + v.quantity, 0);
    }

    /**
     * Products scoped to the selected gender. Everything below (quick-filter
     * chips, stat cards and the product table) is derived from this so the
     * numbers always match the All / Male / Female view. Gender is matched
     * strictly to the product's tag (unisex products show only under "All").
     */
    const scopedProducts = useMemo(() => {
        if (genderFilter === 'all') return products;
        return products.filter((p) => p.gender === genderFilter);
    }, [products, genderFilter]);

    const categories = useMemo(() => {
        const set = new Set<string>();
        products.forEach((p) => set.add(p.category));
        return Array.from(set).sort();
    }, [products]);

    const colors = useMemo(() => {
        const set = new Set<string>();
        products.forEach((p) => p.variants.forEach((v) => v.option2 && set.add(v.option2)));
        return Array.from(set).sort();
    }, [products]);

    /**
     * Per-variant-label aggregate (e.g. "Age 1 → 12 products, 12 units in stock").
     * Used for the quick-filter chip row at the top.
     */
    const variantBuckets = useMemo(() => {
        const map = new Map<string, { variant: string; products: Set<string>; inStockProducts: Set<string>; units: number; outProducts: Set<string> }>();
        scopedProducts.forEach((p) => {
            p.variants.forEach((v) => {
                const key = v.name;
                if (!map.has(key)) {
                    map.set(key, { variant: key, products: new Set(), inStockProducts: new Set(), units: 0, outProducts: new Set() });
                }
                const bucket = map.get(key)!;
                bucket.products.add(p.id);
                bucket.units += v.quantity;
                if (v.quantity > 0) bucket.inStockProducts.add(p.id);
                else bucket.outProducts.add(p.id);
            });
        });
        return Array.from(map.values())
            .map((b) => ({
                variant: b.variant,
                products: b.products.size,
                // Distinct products that actually have stock in this age — this
                // is the number shown on the chip ("available products").
                inStockProducts: b.inStockProducts.size,
                units: b.units,
                outOfStockProducts: b.outProducts.size,
            }))
            .sort((a, b) => variantLabelCompare(a.variant, b.variant));
    }, [scopedProducts]);

    // ─── Filtering ─────────────────────────────────────────────────────────

    const filteredProducts = useMemo(() => {
        const q = searchTerm.trim().toLowerCase();
        return scopedProducts.filter((p) => {
            const stock = effectiveStock(p);
            const status = classifyStock(stock);

            const matchesSearch =
                !q ||
                p.name.toLowerCase().includes(q) ||
                p.sku.toLowerCase().includes(q) ||
                p.category.toLowerCase().includes(q) ||
                p.variants.some((v) => v.name.toLowerCase().includes(q) || (v.option2 || '').toLowerCase().includes(q));

            if (!matchesSearch) return false;
            if (categoryFilter !== 'all' && p.category !== categoryFilter) return false;
            if (stockFilter !== 'all' && status !== stockFilter) return false;

            if (variantFilter !== 'all') {
                const hasVariant = p.variants.some((v) => v.name === variantFilter);
                if (!hasVariant) return false;
            }
            if (colorFilter !== 'all') {
                const hasColor = p.variants.some((v) => v.option2 === colorFilter);
                if (!hasColor) return false;
            }

            return true;
        });
    }, [scopedProducts, searchTerm, categoryFilter, stockFilter, variantFilter, colorFilter]);

    const stats = useMemo(() => {
        let totalUnits = 0;
        let totalRetailValue = 0;
        let totalVariantRows = 0;
        let lowStockProducts = 0;
        let outOfStockProducts = 0;
        let lowStockVariants = 0;
        let outOfStockVariants = 0;

        scopedProducts.forEach((p) => {
            const stock = effectiveStock(p);
            totalUnits += stock;
            totalRetailValue += stock * p.price;
            const status = classifyStock(stock);
            if (status === 'low') lowStockProducts += 1;
            else if (status === 'out') outOfStockProducts += 1;

            p.variants.forEach((v) => {
                totalVariantRows += 1;
                if (v.quantity <= 0) outOfStockVariants += 1;
                else if (v.quantity < LOW_STOCK_THRESHOLD) lowStockVariants += 1;
            });
        });

        return {
            totalProducts: scopedProducts.length,
            totalVariantRows,
            totalUnits,
            totalRetailValue,
            lowStockProducts,
            outOfStockProducts,
            lowStockVariants,
            outOfStockVariants,
        };
    }, [scopedProducts]);

    function clearFilters() {
        setSearchTerm('');
        setStockFilter('all');
        setCategoryFilter('all');
        setColorFilter('all');
        setVariantFilter('all');
        setGenderFilter('all');
    }

    function toggleExpand(productId: string) {
        setExpanded((e) => ({ ...e, [productId]: !e[productId] }));
    }

    function expandAll() {
        const next: Record<string, boolean> = {};
        filteredProducts.forEach((p) => { if (p.variants.length > 0) next[p.id] = true; });
        setExpanded(next);
    }

    function collapseAll() {
        setExpanded({});
    }

    function toggleProductSelection(id: string) {
        setSelectedProducts((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
    }

    function toggleAllProducts() {
        if (selectedProducts.length === filteredProducts.length) setSelectedProducts([]);
        else setSelectedProducts(filteredProducts.map((p) => p.id));
    }

    function handleExportCSV() {
        const header = [
            'Product',
            'SKU',
            'Category',
            'Variant',
            'Color',
            'Variant Stock',
            'Product Total Stock',
            'Unit Price (GH₵)',
            'Retail Value (GH₵)',
            'Status',
        ];
        const rows: string[][] = [];
        filteredProducts.forEach((p) => {
            if (p.variants.length === 0) {
                const stock = p.productQuantity;
                rows.push([
                    p.name, p.sku, p.category, '', '', String(stock), String(stock),
                    p.price.toFixed(2), (stock * p.price).toFixed(2), classifyStock(stock),
                ]);
            } else {
                p.variants.forEach((v) => {
                    rows.push([
                        p.name, p.sku, p.category, v.name, v.option2 || '',
                        String(v.quantity), String(effectiveStock(p)),
                        v.price.toFixed(2), (v.quantity * v.price).toFixed(2),
                        classifyStock(v.quantity),
                    ]);
                });
            }
        });

        const escape = (val: string) => {
            const s = String(val ?? '');
            return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        };
        const csv = [header, ...rows].map((r) => r.map(escape).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `inventory-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    const activeFilterCount =
        (stockFilter !== 'all' ? 1 : 0) +
        (categoryFilter !== 'all' ? 1 : 0) +
        (colorFilter !== 'all' ? 1 : 0) +
        (variantFilter !== 'all' ? 1 : 0) +
        (genderFilter !== 'all' ? 1 : 0) +
        (searchTerm.trim() ? 1 : 0);

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                    <div>
                        <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Inventory Management</h1>
                        <p className="text-gray-600 mt-1 md:mt-2 text-sm md:text-base">
                            Track stock by age, category, colour and variant. Click a row to drill into per-variant stock.
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={fetchInventory}
                            className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-3 rounded-lg font-semibold transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer"
                        >
                            <i className="ri-refresh-line" />
                            Refresh
                        </button>
                        <Link
                            href="/admin"
                            className="bg-gray-900 hover:bg-gray-800 text-white px-6 py-3 rounded-lg font-semibold transition-colors whitespace-nowrap text-center"
                        >
                            Back to Dashboard
                        </Link>
                    </div>
                </div>

                {/* Stat Cards */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
                    <StatCard label="Active Products" value={stats.totalProducts} icon="ri-stack-line" tone="blue" />
                    <StatCard label="Variant Rows" value={stats.totalVariantRows} icon="ri-apps-2-line" tone="indigo" />
                    <StatCard label="Total Units" value={stats.totalUnits} icon="ri-archive-line" tone="emerald" />
                    <StatCard
                        label="Low Stock Products"
                        value={stats.lowStockProducts}
                        sub={`${stats.lowStockVariants} variants`}
                        icon="ri-alert-line"
                        tone="amber"
                    />
                    <StatCard
                        label="Out of Stock"
                        value={stats.outOfStockProducts}
                        sub={`${stats.outOfStockVariants} variants`}
                        icon="ri-close-circle-line"
                        tone="red"
                    />
                    <StatCard
                        label="Retail Value"
                        value={`GH₵${stats.totalRetailValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                        icon="ri-money-dollar-circle-line"
                        tone="gray"
                    />
                </div>

                {/* Audience (gender) toggle */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 mb-6 flex flex-wrap items-center gap-3">
                    <p className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                        <i className="ri-group-line text-gray-500" />
                        Audience
                    </p>
                    <div className="flex items-center bg-gray-100 rounded-lg p-1">
                        {([
                            { id: 'all', label: 'All', icon: 'ri-apps-2-line' },
                            { id: 'male', label: 'Male', icon: 'ri-men-line' },
                            { id: 'female', label: 'Female', icon: 'ri-women-line' },
                        ] as { id: GenderFilter; label: string; icon: string }[]).map((g) => (
                            <button
                                key={g.id}
                                onClick={() => setGenderFilter(g.id)}
                                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-semibold transition-colors ${
                                    genderFilter === g.id
                                        ? g.id === 'male'
                                            ? 'bg-sky-600 text-white shadow-sm'
                                            : g.id === 'female'
                                                ? 'bg-pink-600 text-white shadow-sm'
                                                : 'bg-white text-gray-900 shadow-sm'
                                        : 'text-gray-600 hover:text-gray-900'
                                }`}
                            >
                                <i className={g.icon} />
                                {g.label}
                            </button>
                        ))}
                    </div>
                    <span className="text-xs text-gray-500">
                        {genderFilter === 'all'
                            ? 'Showing products for all audiences'
                            : `Showing ${genderFilter} products only (unisex items appear under “All”)`}
                    </span>
                </div>

                {/* Variant quick-filter chips */}
                {variantBuckets.length > 0 && (
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 mb-6">
                        <div className="flex items-center justify-between mb-3">
                            <p className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                                <i className="ri-price-tag-3-line text-gray-500" />
                                Quick filter by age / variant
                            </p>
                            {variantFilter !== 'all' && (
                                <button
                                    onClick={() => setVariantFilter('all')}
                                    className="text-xs text-gray-500 hover:text-gray-900 underline"
                                >
                                    Clear variant filter
                                </button>
                            )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <button
                                onClick={() => setVariantFilter('all')}
                                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                                    variantFilter === 'all'
                                        ? 'border-gray-900 bg-gray-900 text-white'
                                        : 'border-gray-200 bg-white text-gray-700 hover:border-gray-400'
                                }`}
                            >
                                All variants
                            </button>
                            {variantBuckets.map((b) => {
                                const active = variantFilter === b.variant;
                                const allOut = b.inStockProducts <= 0;
                                return (
                                    <button
                                        key={b.variant}
                                        onClick={() => setVariantFilter(active ? 'all' : b.variant)}
                                        className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors flex items-center gap-2 ${
                                            active
                                                ? 'border-gray-900 bg-gray-900 text-white'
                                                : allOut
                                                  ? 'border-red-200 bg-red-50 text-red-700 hover:border-red-300'
                                                  : 'border-gray-200 bg-white text-gray-700 hover:border-gray-400'
                                        }`}
                                        title={`${b.inStockProducts} product${b.inStockProducts === 1 ? '' : 's'} available in this age · ${b.units} unit${b.units === 1 ? '' : 's'} in stock`}
                                    >
                                        <span>{b.variant}</span>
                                        <span
                                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                                active
                                                    ? 'bg-white/20'
                                                    : allOut
                                                      ? 'bg-red-100 text-red-800'
                                                      : 'bg-gray-100 text-gray-700'
                                            }`}
                                        >
                                            {b.inStockProducts}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Filters bar */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 md:p-6 mb-6">
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                        <div className="md:col-span-4">
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                                Search
                            </label>
                            <div className="relative">
                                <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Product name, SKU, variant, colour..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2.5 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-gray-900 text-sm"
                                />
                            </div>
                        </div>
                        <div className="md:col-span-3">
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                                Category
                            </label>
                            <select
                                value={categoryFilter}
                                onChange={(e) => setCategoryFilter(e.target.value)}
                                className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-gray-900 text-sm cursor-pointer bg-white"
                            >
                                <option value="all">All categories ({categories.length})</option>
                                {categories.map((c) => (
                                    <option key={c} value={c}>{c}</option>
                                ))}
                            </select>
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                                Colour
                            </label>
                            <select
                                value={colorFilter}
                                onChange={(e) => setColorFilter(e.target.value)}
                                disabled={colors.length === 0}
                                className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-gray-900 text-sm cursor-pointer bg-white disabled:bg-gray-50 disabled:cursor-not-allowed"
                            >
                                <option value="all">All colours{colors.length ? ` (${colors.length})` : ''}</option>
                                {colors.map((c) => (
                                    <option key={c} value={c}>{c}</option>
                                ))}
                            </select>
                        </div>
                        <div className="md:col-span-3">
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                                Stock status
                            </label>
                            <div className="flex items-center bg-gray-100 rounded-lg p-1">
                                {([
                                    { id: 'all', label: 'All' },
                                    { id: 'good', label: 'In Stock' },
                                    { id: 'low', label: 'Low' },
                                    { id: 'out', label: 'Out' },
                                ] as { id: StockFilter; label: string }[]).map((f) => (
                                    <button
                                        key={f.id}
                                        onClick={() => setStockFilter(f.id)}
                                        className={`flex-1 px-2 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                                            stockFilter === f.id
                                                ? 'bg-white text-gray-900 shadow-sm'
                                                : 'text-gray-600 hover:text-gray-900'
                                        }`}
                                    >
                                        {f.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-gray-100">
                        <div className="flex items-center gap-3 text-sm text-gray-600">
                            <span>
                                Showing <span className="font-semibold text-gray-900">{filteredProducts.length}</span> of{' '}
                                <span className="font-semibold text-gray-900">{scopedProducts.length}</span> products
                            </span>
                            {activeFilterCount > 0 && (
                                <button onClick={clearFilters} className="text-xs text-gray-700 hover:text-gray-900 underline">
                                    Clear filters
                                </button>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={expandAll}
                                className="px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                                <i className="ri-expand-up-down-line mr-1" />
                                Expand all
                            </button>
                            <button
                                onClick={collapseAll}
                                className="px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                                <i className="ri-contract-up-down-line mr-1" />
                                Collapse all
                            </button>
                            <button
                                onClick={handleExportCSV}
                                className="bg-gray-900 hover:bg-gray-800 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 whitespace-nowrap"
                            >
                                <i className="ri-download-line" />
                                Export CSV
                            </button>
                        </div>
                    </div>
                </div>

                {/* Bulk action bar */}
                {selectedProducts.length > 0 && (
                    <div className="mb-6 flex items-center justify-between p-4 bg-gray-900 text-white rounded-xl">
                        <p className="font-semibold">
                            {selectedProducts.length} product{selectedProducts.length === 1 ? '' : 's'} selected
                        </p>
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => alert('Bulk restock coming soon — wire this to your purchase-order flow.')}
                                className="px-4 py-2 bg-white text-gray-900 rounded-lg text-sm font-semibold hover:bg-gray-100"
                            >
                                Bulk Restock
                            </button>
                            <button
                                onClick={() => setSelectedProducts([])}
                                className="text-sm text-gray-200 hover:text-white"
                            >
                                Clear
                            </button>
                        </div>
                    </div>
                )}

                {/* Table */}
                <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-200">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-50 border-b border-gray-200">
                                <tr>
                                    <th className="w-10 px-4 py-3"></th>
                                    <th className="px-4 py-3 text-left">
                                        <input
                                            type="checkbox"
                                            checked={
                                                selectedProducts.length === filteredProducts.length &&
                                                filteredProducts.length > 0
                                            }
                                            onChange={toggleAllProducts}
                                            className="w-4 h-4 text-gray-900 rounded cursor-pointer"
                                        />
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Product</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">SKU</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Category</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Variants</th>
                                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Stock</th>
                                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Retail Value</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                                    <th className="px-4 py-3"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {loading ? (
                                    <tr>
                                        <td colSpan={10} className="p-12 text-center text-gray-500">
                                            <i className="ri-loader-4-line animate-spin text-2xl mr-2" />
                                            Loading inventory...
                                        </td>
                                    </tr>
                                ) : error ? (
                                    <tr>
                                        <td colSpan={10} className="p-12 text-center text-red-600">
                                            <i className="ri-error-warning-line text-2xl mr-2" />
                                            {error}
                                        </td>
                                    </tr>
                                ) : filteredProducts.length === 0 ? (
                                    <tr>
                                        <td colSpan={10} className="p-12 text-center text-gray-500">
                                            <i className="ri-search-line text-2xl mb-2 block" />
                                            No products match the current filters.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredProducts.map((p) => {
                                        const stock = effectiveStock(p);
                                        const status = classifyStock(stock);
                                        const retailValue = stock * p.price;
                                        const variantCount = p.variants.length;
                                        const isOpen = !!expanded[p.id];

                                        // Variants matching the current "Age" filter (or all if no filter)
                                        const visibleVariants = variantFilter === 'all'
                                            ? p.variants
                                            : p.variants.filter((v) => v.name === variantFilter);

                                        return (
                                            <Fragment key={p.id}>
                                                <tr className="hover:bg-gray-50">
                                                    <td className="px-4 py-3 text-center">
                                                        {variantCount > 0 ? (
                                                            <button
                                                                onClick={() => toggleExpand(p.id)}
                                                                className="w-7 h-7 rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors"
                                                                title={isOpen ? 'Collapse variants' : 'Show variants'}
                                                            >
                                                                <i className={`ri-arrow-${isOpen ? 'down' : 'right'}-s-line text-lg`} />
                                                            </button>
                                                        ) : (
                                                            <span className="text-gray-300 text-xs">—</span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedProducts.includes(p.id)}
                                                            onChange={() => toggleProductSelection(p.id)}
                                                            className="w-4 h-4 text-gray-900 rounded cursor-pointer"
                                                        />
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <Link
                                                            href={`/admin/products/${p.id}`}
                                                            className="font-semibold text-gray-900 hover:text-gray-700"
                                                        >
                                                            {p.name}
                                                        </Link>
                                                    </td>
                                                    <td className="px-4 py-3 text-sm text-gray-600 font-mono">{p.sku}</td>
                                                    <td className="px-4 py-3 text-sm text-gray-700">{p.category}</td>
                                                    <td className="px-4 py-3 text-sm text-gray-700">
                                                        {variantCount === 0 ? (
                                                            <span className="text-gray-400">No variants</span>
                                                        ) : (
                                                            <div className="flex items-center gap-1.5">
                                                                <span className="text-gray-900 font-medium">{variantCount}</span>
                                                                <span className="text-gray-500 text-xs">
                                                                    {variantCount === 1 ? 'variant' : 'variants'}
                                                                </span>
                                                                {variantFilter !== 'all' && visibleVariants.length > 0 && (
                                                                    <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-gray-100 text-gray-700">
                                                                        {variantFilter}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3 text-right">
                                                        <span className="font-semibold text-gray-900">{stock}</span>
                                                    </td>
                                                    <td className="px-4 py-3 text-right font-semibold text-gray-900 whitespace-nowrap">
                                                        GH₵{retailValue.toFixed(2)}
                                                    </td>
                                                    <td className="px-4 py-3">{statusBadge(status)}</td>
                                                    <td className="px-4 py-3 text-right">
                                                        <Link
                                                            href={`/admin/products/${p.id}`}
                                                            className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors"
                                                            title="Edit product"
                                                        >
                                                            <i className="ri-edit-line text-lg" />
                                                        </Link>
                                                    </td>
                                                </tr>

                                                {isOpen && variantCount > 0 && (
                                                    <tr className="bg-gray-50/60">
                                                        <td colSpan={10} className="px-4 py-3">
                                                            <div className="ml-10">
                                                                <table className="w-full text-sm">
                                                                    <thead>
                                                                        <tr className="text-xs text-gray-500 uppercase tracking-wider">
                                                                            <th className="text-left py-1.5 font-semibold">Variant</th>
                                                                            <th className="text-left py-1.5 font-semibold">Colour</th>
                                                                            <th className="text-right py-1.5 font-semibold">Stock</th>
                                                                            <th className="text-right py-1.5 font-semibold">Unit Price</th>
                                                                            <th className="text-right py-1.5 font-semibold">Retail Value</th>
                                                                            <th className="text-left py-1.5 font-semibold pl-4">Status</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                        {visibleVariants.map((v) => {
                                                                            const vStatus = classifyStock(v.quantity);
                                                                            return (
                                                                                <tr key={v.id} className="border-t border-gray-200">
                                                                                    <td className="py-2 font-medium text-gray-900">{v.name}</td>
                                                                                    <td className="py-2 text-gray-600">{v.option2 || <span className="text-gray-300">—</span>}</td>
                                                                                    <td className="py-2 text-right font-semibold text-gray-900">{v.quantity}</td>
                                                                                    <td className="py-2 text-right text-gray-700">GH₵{v.price.toFixed(2)}</td>
                                                                                    <td className="py-2 text-right text-gray-700">GH₵{(v.price * v.quantity).toFixed(2)}</td>
                                                                                    <td className="py-2 pl-4">{statusBadge(vStatus)}</td>
                                                                                </tr>
                                                                            );
                                                                        })}
                                                                        {visibleVariants.length === 0 && (
                                                                            <tr><td colSpan={6} className="py-3 text-gray-400 italic">No variants match the current filter.</td></tr>
                                                                        )}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </Fragment>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── Stat card ─────────────────────────────────────────────────────────────

function StatCard({
    label,
    value,
    sub,
    icon,
    tone,
}: {
    label: string;
    value: number | string;
    sub?: string;
    icon: string;
    tone: 'blue' | 'indigo' | 'emerald' | 'amber' | 'red' | 'gray';
}) {
    const tones: Record<string, { bg: string; text: string }> = {
        blue: { bg: 'bg-blue-50', text: 'text-blue-600' },
        indigo: { bg: 'bg-indigo-50', text: 'text-indigo-600' },
        emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600' },
        amber: { bg: 'bg-amber-50', text: 'text-amber-600' },
        red: { bg: 'bg-red-50', text: 'text-red-600' },
        gray: { bg: 'bg-gray-100', text: 'text-gray-700' },
    };
    const t = tones[tone];
    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider truncate">{label}</p>
                    <p className={`text-xl md:text-2xl font-bold mt-1 truncate ${t.text}`}>{value}</p>
                    {sub && <p className="text-[11px] text-gray-500 mt-0.5">{sub}</p>}
                </div>
                <div className={`w-9 h-9 flex items-center justify-center ${t.bg} rounded-lg flex-shrink-0`}>
                    <i className={`${icon} text-lg ${t.text}`} />
                </div>
            </div>
        </div>
    );
}

