'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { supabase } from '@/lib/supabase'; // used for categories fetch only
import { useRouter } from 'next/navigation';

interface ProductFormProps {
    initialData?: any;
    isEditMode?: boolean;
}

export default function ProductForm({ initialData, isEditMode = false }: ProductFormProps) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [categories, setCategories] = useState<any[]>([]);

    const [productName, setProductName] = useState(initialData?.name || '');
    const [categoryId, setCategoryId] = useState(initialData?.category_id || '');
    const [price, setPrice] = useState(initialData?.price ?? '');
    const [comparePrice, setComparePrice] = useState(initialData?.compare_at_price ?? '');
    const [onSale, setOnSale] = useState(!!(initialData?.compare_at_price && parseFloat(initialData.compare_at_price) > parseFloat(initialData?.price || 0)));
    const [wholesalePrice, setWholesalePrice] = useState(initialData?.metadata?.wholesale_price ?? '');
    const [wholesaleMinQty, setWholesaleMinQty] = useState(initialData?.metadata?.wholesale_min_qty ?? '');
    const [sku, setSku] = useState(initialData?.sku || '');
    const [stock, setStock] = useState(initialData?.quantity || '');
    const [moq, setMoq] = useState(initialData?.moq || '1');
    const [lowStockThreshold, setLowStockThreshold] = useState(initialData?.metadata?.low_stock_threshold || '5');
    const [description, setDescription] = useState(initialData?.description || '');
    const [status, setStatus] = useState(initialData?.status || 'Active');
    const [featured, setFeatured] = useState(initialData?.featured || false);
    // Target audience: 'male' (boys), 'female' (girls) or 'unisex'. Defaults to unisex.
    const [gender, setGender] = useState<'male' | 'female' | 'unisex'>(
        initialData?.gender === 'male' || initialData?.gender === 'female' ? initialData.gender : 'unisex'
    );
    const [preorderShipping, setPreorderShipping] = useState(initialData?.metadata?.preorder_shipping || '');
    const [activeTab, setActiveTab] = useState('general');
    const [aiGenerating, setAiGenerating] = useState(false);

    // Auto-generate SKU function
    const generateSku = () => {
        const prefix = 'DBT';
        const timestamp = Date.now().toString(36).toUpperCase().slice(-4);
        const random = Math.random().toString(36).substring(2, 6).toUpperCase();
        return `${prefix}-${timestamp}-${random}`;
    };

    // --- Variant System ---
    // Preset color palette
    const colorPresets = [
        { name: 'Black', hex: '#000000' },
        { name: 'White', hex: '#FFFFFF' },
        { name: 'Red', hex: '#EF4444' },
        { name: 'Blue', hex: '#3B82F6' },
        { name: 'Navy', hex: '#1E3A5F' },
        { name: 'Green', hex: '#22C55E' },
        { name: 'Yellow', hex: '#EAB308' },
        { name: 'Pink', hex: '#EC4899' },
        { name: 'Purple', hex: '#A855F7' },
        { name: 'Orange', hex: '#F97316' },
        { name: 'Gray', hex: '#6B7280' },
        { name: 'Brown', hex: '#92400E' },
        { name: 'Beige', hex: '#D2B48C' },
        { name: 'Maroon', hex: '#800000' },
        { name: 'Teal', hex: '#14B8A6' },
        { name: 'Cream', hex: '#FFFDD0' },
        { name: 'Gold', hex: '#D4AF37' },
        { name: 'Silver', hex: '#C0C0C0' },
    ];
    // Kids’ ages as default size options (custom sizes still allowed)
    const sizePresets = Array.from({ length: 12 }, (_, i) => `Age ${i + 1}`);
    /** Set true to show color chips + custom colors on the Variants tab */
    const SHOW_PRODUCT_COLOR_VARIANTS = false;

    // Parse existing variants to extract unique colors, sizes, and variant image
    const existingVariants = (initialData?.product_variants || []).map((v: any) => ({
        ...v,
        stock: v.stock ?? v.quantity ?? 0,
        color: v.color ?? v.option2 ?? '',
        size: v.name || '',
        image_url: v.image_url || ''
    }));

    const [selectedColors, setSelectedColors] = useState<{ name: string; hex: string }[]>(() => {
        const colors = new Map<string, string>();
        existingVariants.forEach((v: any) => {
            if (v.color) {
                const preset = colorPresets.find(c => c.name.toLowerCase() === v.color.toLowerCase());
                colors.set(v.color, preset?.hex || '#888888');
            }
        });
        return Array.from(colors.entries()).map(([name, hex]) => ({ name, hex }));
    });

    const [selectedSizes, setSelectedSizes] = useState<string[]>(() => {
        const sizes = new Set<string>();
        existingVariants.forEach((v: any) => {
            if (v.size) sizes.add(v.size);
        });
        return Array.from(sizes);
    });

    const [customColorName, setCustomColorName] = useState('');
    const [customColorHex, setCustomColorHex] = useState('#888888');
    const [customSize, setCustomSize] = useState('');

    // Build variants from colors × sizes (or just sizes, or just colors)
    const buildVariantKey = (color: string, size: string) => `${color}|||${size}`;

    // Store variant data (price, stock, sku, optional image_url) keyed by "color|||size"
    const [variantData, setVariantData] = useState<Record<string, { price: string; stock: string; sku: string; image_url?: string }>>(() => {
        const data: Record<string, { price: string; stock: string; sku: string; image_url?: string }> = {};
        existingVariants.forEach((v: any) => {
            const key = buildVariantKey(v.color || '', v.size || '');
            data[key] = {
                price: v.price?.toString() || '',
                stock: v.stock?.toString() || '0',
                sku: v.sku || '',
                image_url: v.image_url || undefined
            };
        });
        return data;
    });

    // Computed: all variant combinations
    const variantCombinations = (() => {
        const combos: { color: string; colorHex: string; size: string; key: string }[] = [];
        const colors = selectedColors.length > 0 ? selectedColors : [{ name: '', hex: '' }];
        const sizes = selectedSizes.length > 0 ? selectedSizes : [''];

        for (const color of colors) {
            for (const size of sizes) {
                if (!color.name && !size) continue; // skip if both empty
                const key = buildVariantKey(color.name, size);
                combos.push({ color: color.name, colorHex: color.hex, size, key });
            }
        }
        return combos;
    })();

    // Build the flat variants array for saving (used by handleSubmit)
    const variants = variantCombinations.map((combo, idx) => {
        const d = variantData[combo.key] || { price: price, stock: '0', sku: '' };
        return {
            name: combo.size,
            color: combo.color,
            sku: d.sku,
            price: d.price || price,
            stock: d.stock || '0',
            image_url: d.image_url || undefined,
            sort_order: idx,
        };
    });

    const updateVariantField = (key: string, field: string, value: string) => {
        setVariantData(prev => ({
            ...prev,
            [key]: { ...prev[key] || { price: price, stock: '0', sku: '' }, [field]: value }
        }));
    };

    const setVariantImage = (key: string, imageUrl: string) => {
        setVariantData(prev => ({
            ...prev,
            [key]: { ...prev[key] || { price: price, stock: '0', sku: '' }, image_url: imageUrl || undefined }
        }));
    };

    // Bulk set price/stock for all variants
    const bulkSetField = (field: 'price' | 'stock', value: string) => {
        setVariantData(prev => {
            const updated = { ...prev };
            variantCombinations.forEach(combo => {
                updated[combo.key] = { ...updated[combo.key] || { price: price, stock: '0', sku: '' }, [field]: value };
            });
            return updated;
        });
    };

    const toggleColor = (color: { name: string; hex: string }) => {
        setSelectedColors(prev => {
            const exists = prev.find(c => c.name === color.name);
            if (exists) return prev.filter(c => c.name !== color.name);
            return [...prev, color];
        });
    };

    const toggleSize = (size: string) => {
        setSelectedSizes(prev => {
            if (prev.includes(size)) return prev.filter(s => s !== size);
            return [...prev, size];
        });
    };

    const addCustomColor = () => {
        if (!customColorName.trim()) return;
        const exists = selectedColors.find(c => c.name.toLowerCase() === customColorName.trim().toLowerCase());
        if (!exists) {
            setSelectedColors(prev => [...prev, { name: customColorName.trim(), hex: customColorHex }]);
        }
        setCustomColorName('');
        setCustomColorHex('#888888');
    };

    const addCustomSize = () => {
        if (!customSize.trim()) return;
        if (!selectedSizes.includes(customSize.trim())) {
            setSelectedSizes(prev => [...prev, customSize.trim()]);
        }
        setCustomSize('');
    };

    const editSize = (oldSize: string, newSize: string) => {
        const trimmed = newSize.trim();
        if (!trimmed || trimmed === oldSize) return;
        if (selectedSizes.includes(trimmed)) return; // avoid duplicate
        setSelectedSizes(prev => prev.map(s => s === oldSize ? trimmed : s));
        setVariantData(prev => {
            const next: Record<string, { price: string; stock: string; sku: string; image_url?: string }> = {};
            Object.entries(prev).forEach(([key, val]) => {
                const [color, size] = key.split('|||');
                next[size === oldSize ? buildVariantKey(color, trimmed) : key] = val;
            });
            return next;
        });
    };

    const editColor = (oldName: string, newName: string, newHex?: string) => {
        const trimmed = newName.trim();
        if (!trimmed || trimmed === oldName) return;
        if (selectedColors.some(c => c.name.toLowerCase() === trimmed.toLowerCase())) return;
        const hex = newHex || selectedColors.find(c => c.name === oldName)?.hex || '#888888';
        setSelectedColors(prev => prev.map(c => c.name === oldName ? { name: trimmed, hex } : c));
        setVariantData(prev => {
            const next: Record<string, { price: string; stock: string; sku: string; image_url?: string }> = {};
            Object.entries(prev).forEach(([key, val]) => {
                const [color, size] = key.split('|||');
                next[color === oldName ? buildVariantKey(trimmed, size) : key] = val;
            });
            return next;
        });
    };

    // Images
    const [images, setImages] = useState<any[]>(initialData?.product_images || []);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState<{ name: string; done: boolean }[]>([]);

    // SEO
    const [seoTitle, setSeoTitle] = useState(initialData?.seo_title || '');
    const [metaDescription, setMetaDescription] = useState(initialData?.seo_description || '');
    const [urlSlug, setUrlSlug] = useState(initialData?.slug || '');
    const [keywords, setKeywords] = useState(initialData?.tags?.join(', ') || '');
    // Track manual edits so auto-generation doesn't overwrite user changes
    const [seoTitleEdited, setSeoTitleEdited] = useState(!!initialData?.seo_title);
    const [metaDescEdited, setMetaDescEdited] = useState(!!initialData?.seo_description);
    const [keywordsEdited, setKeywordsEdited] = useState(!!(initialData?.tags?.length));

    const initialCopRow = (() => {
        const rel = initialData?.product_cost_of_production;
        if (Array.isArray(rel)) return rel[0] ?? null;
        return rel ?? null;
    })();
    const [copEnabled, setCopEnabled] = useState(() => {
        if (!initialCopRow) return false;
        const hasPerVariant =
            initialCopRow.per_variant_costs &&
            typeof initialCopRow.per_variant_costs === 'object' &&
            Object.keys(initialCopRow.per_variant_costs).length > 0;
        return (
            Number(initialCopRow.fabric_cost) > 0 ||
            Number(initialCopRow.other_cost) > 0 ||
            Number(initialCopRow.labour_cost) > 0 ||
            !!initialCopRow.production_staff_id ||
            !!(initialCopRow.cop_description && String(initialCopRow.cop_description).trim()) ||
            !!hasPerVariant
        );
    });
    const [copDescription, setCopDescription] = useState(initialCopRow?.cop_description || '');
    const [fabricCost, setFabricCost] = useState(
        initialCopRow?.fabric_cost != null ? String(initialCopRow.fabric_cost) : ''
    );
    const [otherCost, setOtherCost] = useState(
        initialCopRow?.other_cost != null ? String(initialCopRow.other_cost) : ''
    );
    const [labourCost, setLabourCost] = useState(
        initialCopRow?.labour_cost != null ? String(initialCopRow.labour_cost) : ''
    );
    const [productionStaffId, setProductionStaffId] = useState<string>(initialCopRow?.production_staff_id || '');
    const [productionStaff, setProductionStaff] = useState<{ id: string; full_name: string }[]>([]);

    // Per-variant cost overrides — keyed by `${color}|||${size}` (same key the
    // variants tab uses). Each entry only stores the fields that actually
    // override the product-level defaults; empty strings mean "inherit".
    type VariantCostInput = { fabric: string; other: string; labour: string };
    const initialPerVariantCosts: Record<string, VariantCostInput> = (() => {
        const raw = initialCopRow?.per_variant_costs;
        if (!raw || typeof raw !== 'object') return {};
        const out: Record<string, VariantCostInput> = {};
        for (const [key, value] of Object.entries(raw as Record<string, any>)) {
            if (!value || typeof value !== 'object') continue;
            out[key] = {
                fabric: value.fabric_cost != null ? String(value.fabric_cost) : '',
                other: value.other_cost != null ? String(value.other_cost) : '',
                labour: value.labour_cost != null ? String(value.labour_cost) : '',
            };
        }
        return out;
    })();
    const [perVariantCosts, setPerVariantCosts] = useState<Record<string, VariantCostInput>>(initialPerVariantCosts);
    const [perVariantCopEnabled, setPerVariantCopEnabled] = useState<boolean>(
        Object.keys(initialPerVariantCosts).length > 0
    );

    const generateSeoFields = (name: string, desc: string) => {
        const title = name ? `${name} | Freby’s Fashion GH` : '';
        const metaDesc = desc
            ? (desc.length > 160 ? desc.substring(0, 157).trimEnd() + '...' : desc)
            : name ? `Shop ${name} at Freby’s Fashion GH. Unique kids Ankara fashion in Ghana with worldwide delivery.` : '';
        const kw = name
            ? [...new Set([
                name.toLowerCase(),
                ...name.toLowerCase().split(/\s+/).filter(w => w.length > 2),
                'frebys fashion', 'kids ankara ghana', 'kids fashion'
              ])].join(', ')
            : '';
        return { title, metaDesc, kw };
    };

    const tabs = [
        { id: 'general', label: 'General', icon: 'ri-information-line' },
        { id: 'pricing', label: 'Pricing & Inventory', icon: 'ri-price-tag-3-line' },
        { id: 'variants', label: 'Variants', icon: 'ri-layout-grid-line' },
        { id: 'images', label: 'Images', icon: 'ri-image-line' },
        { id: 'cop', label: 'COP', icon: 'ri-calculator-line' },
        { id: 'seo', label: 'SEO', icon: 'ri-search-line' }
    ];

    // Fetch categories on mount
    useEffect(() => {
        async function fetchCategories() {
            const { data } = await supabase.from('categories').select('id, name').eq('status', 'active');
            if (data) {
                setCategories(data);
                if (data.length > 0 && !categoryId) {
                    setCategoryId(data[0].id);
                }
            }
        }
        fetchCategories();
    }, [categoryId]);

    useEffect(() => {
        async function fetchProductionStaff() {
            try {
                const res = await fetch('/api/admin/production-staff?active=1', { credentials: 'include' });
                const json = await res.json().catch(() => ({}));
                if (res.ok && Array.isArray(json.data)) {
                    setProductionStaff(json.data.map((s: any) => ({ id: s.id, full_name: s.full_name })));
                }
            } catch {
                /* optional */
            }
        }
        fetchProductionStaff();
    }, []);

    // Auto-generate slug from name if not manually edited
    useEffect(() => {
        if (!isEditMode && productName && !urlSlug) {
            setUrlSlug(productName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, ''));
        }
    }, [productName, isEditMode, urlSlug]);

    // Auto-generate SEO fields from name + description (only if not manually edited)
    useEffect(() => {
        if (isEditMode) return; // don't auto-overwrite on edit
        const { title, metaDesc, kw } = generateSeoFields(productName, description);
        if (!seoTitleEdited) setSeoTitle(title);
        if (!metaDescEdited) setMetaDescription(metaDesc);
        if (!keywordsEdited) setKeywords(kw);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [productName, description]);

    // Auto-generate SKU for new products
    useEffect(() => {
        if (!isEditMode && !sku) {
            setSku(generateSku());
        }
    }, [isEditMode]); // eslint-disable-line react-hooks/exhaustive-deps

    // Keep On Sale toggle in sync with Compare at Price (interchangeable)
    useEffect(() => {
        const hasSale = !!(comparePrice && price && parseFloat(comparePrice) > parseFloat(price));
        setOnSale(hasSale);
    }, [comparePrice, price]);

    const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        try {
            if (!e.target.files || e.target.files.length === 0) return;

            const files = Array.from(e.target.files);
            const existingCount = images.length;
            const maxItems = 10;

            if (existingCount + files.length > maxItems) {
                alert(`You can upload up to ${maxItems} media items per product. You have ${existingCount} already. Please remove some or select fewer files.`);
                return;
            }

            setUploading(true);
            setUploadProgress(files.map(f => ({ name: f.name, done: false })));

            const newImages: any[] = [];

            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const fileExt = file.name.split('.').pop()?.toLowerCase() || '';
                const isVideo = ['mp4', 'mov', 'webm'].includes(fileExt);

                const maxSize = isVideo ? 100 * 1024 * 1024 : 5 * 1024 * 1024;
                if (file.size > maxSize) {
                    alert(`"${file.name}" is too large. Max: ${isVideo ? '100MB for videos' : '5MB for images'}`);
                    setUploadProgress(prev => prev.map((p, idx) => idx === i ? { ...p, done: true } : p));
                    continue;
                }

                const formData = new FormData();
                formData.append('file', file);
                formData.append('bucket', 'product-images');

                const res = await fetch('/api/admin/upload', {
                    method: 'POST',
                    body: formData,
                    credentials: 'include',
                });

                const data = await res.json().catch(() => ({}));
                setUploadProgress(prev => prev.map((p, idx) => idx === i ? { ...p, done: true } : p));

                if (!res.ok) {
                    alert(data.error || `Upload failed for "${file.name}"`);
                    continue;
                }

                const url = data.url;
                if (!url) {
                    alert(`No URL returned for "${file.name}"`);
                    continue;
                }

                newImages.push({
                    url,
                    position: existingCount + newImages.length,
                    media_type: isVideo ? 'video' : 'image',
                });
            }

            if (newImages.length > 0) {
                setImages(prev => [...prev, ...newImages]);
            }
        } catch (error: any) {
            alert('Error uploading: ' + (error?.message || 'Upload failed'));
        } finally {
            setUploading(false);
            setUploadProgress([]);
            if (e.target) e.target.value = '';
        }
    };

    const handleRemoveImage = (indexToRemove: number) => {
        setImages(images.filter((_, idx) => idx !== indexToRemove));
    };

    const handleImageReorder = (result: DropResult) => {
        if (!result.destination) return;
        const items = Array.from(images);
        const [reordered] = items.splice(result.source.index, 1);
        items.splice(result.destination.index, 0, reordered);
        setImages(items);
    };

    const handleAiDescription = async () => {
        const firstImage = images.find((img: any) => img.media_type !== 'video');
        if (!firstImage?.url) {
            alert('Please upload at least one product image first so AI can analyze it.');
            return;
        }
        setAiGenerating(true);
        try {
            const selectedCat = categories.find((c: any) => c.id === categoryId);
            const res = await fetch('/api/admin/products/generate-description', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    imageUrl: firstImage.url,
                    productName: productName || undefined,
                    categoryName: selectedCat?.name || undefined,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to generate');
            setDescription(data.description);
        } catch (err: any) {
            alert(err.message || 'AI generation failed. Please try again.');
        } finally {
            setAiGenerating(false);
        }
    };

    // Variant helpers removed — variants are now auto-generated from selectedColors × selectedSizes

    const handleSubmit = async () => {
        try {
            setLoading(true);

            const hasVariants = variants.length > 0;
            const variantStockTotal = hasVariants
                ? variants.reduce((sum, v) => sum + (parseInt(v.stock) || 0), 0)
                : parseInt(stock) || 0;

            // Build variants payload with colorHex and image_url for the API
            const variantsPayload = variants.map(v => ({
                ...v,
                colorHex: selectedColors.find(c => c.name === v.color)?.hex || null,
                image_url: v.image_url || null,
            }));

            const productData = {
                name: productName,
                slug: urlSlug || productName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, ''),
                description,
                category_id: categoryId || null,
                price: parseFloat(price) || 0,
                compare_at_price: comparePrice ? parseFloat(comparePrice) : null,
                sku: sku || generateSku(),
                quantity: hasVariants ? variantStockTotal : (parseInt(stock) || 0),
                moq: parseInt(moq) || 1,
                status: status.toLowerCase(),
                featured,
                gender,
                seo_title: seoTitle,
                seo_description: metaDescription,
                tags: (keywords as string).split(',').map((k: string) => k.trim()).filter(Boolean),
                metadata: {
                    low_stock_threshold: parseInt(lowStockThreshold) || 5,
                    preorder_shipping: preorderShipping.trim() || null,
                    wholesale_price: wholesalePrice ? parseFloat(wholesalePrice) : null,
                    wholesale_min_qty: wholesaleMinQty ? parseInt(wholesaleMinQty) : null
                },
                variants: variantsPayload,
            };

            // Only ship per-variant entries that (a) match a current variant key
            // and (b) actually contain at least one numeric override. Anything else
            // is dropped server-side, but doing it here as well keeps the payload
            // small and prevents stale entries (e.g. a deleted size) from sticking.
            const activeVariantKeys = new Set(variantCombinations.map((c) => c.key));
            const perVariantPayload: Record<string, { fabric_cost?: number; other_cost?: number; labour_cost?: number }> = {};
            if (perVariantCopEnabled) {
                for (const [key, val] of Object.entries(perVariantCosts)) {
                    if (!activeVariantKeys.has(key)) continue;
                    const entry: { fabric_cost?: number; other_cost?: number; labour_cost?: number } = {};
                    const f = parseFloat(val.fabric);
                    const o = parseFloat(val.other);
                    const l = parseFloat(val.labour);
                    if (Number.isFinite(f) && f > 0) entry.fabric_cost = f;
                    if (Number.isFinite(o) && o > 0) entry.other_cost = o;
                    if (Number.isFinite(l) && l > 0) entry.labour_cost = l;
                    if (Object.keys(entry).length > 0) perVariantPayload[key] = entry;
                }
            }

            const copPayload = {
                enabled: copEnabled,
                cop_description: copDescription.trim() || null,
                fabric_cost: parseFloat(fabricCost) || 0,
                other_cost: parseFloat(otherCost) || 0,
                labour_cost: parseFloat(labourCost) || 0,
                production_staff_id: productionStaffId || null,
                per_variant_costs: perVariantPayload,
            };

            let productId = initialData?.id;

            if (isEditMode && productId) {
                // Update via API (service role — bypasses RLS)
                const res = await fetch(`/api/admin/products/${productId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ ...productData, cop: copPayload }),
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.error || 'Failed to update product');
            } else {
                // Create via API (service role — bypasses RLS, handles unique slug)
                const res = await fetch('/api/admin/products', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ ...productData, cop: copPayload }),
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.error || 'Failed to create product');
                productId = data.id;
            }

            // Save images via API
            if (productId) {
                const res = await fetch(`/api/admin/products/${productId}/images`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({
                        images: images.map((img: any, idx: number) => ({
                            url: img.url,
                            position: idx,
                            alt_text: productName,
                            media_type: img.media_type || 'image',
                        })),
                        productName,
                    }),
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.error || 'Failed to save product images');
            }

            alert(isEditMode
                ? 'Product updated successfully!'
                : 'Product created successfully!');
            router.push('/admin/products');

        } catch (err: any) {
            console.error('Error saving product:', err);
            alert(`Error: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                    <Link
                        href="/admin/products"
                        className="w-10 h-10 flex items-center justify-center border-2 border-gray-300 rounded-lg hover:border-gray-400 transition-colors"
                    >
                        <i className="ri-arrow-left-line text-xl text-gray-700"></i>
                    </Link>
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900">
                            {isEditMode ? 'Edit Product' : 'Add New Product'}
                        </h1>
                        <p className="text-gray-600 mt-1">
                            {isEditMode ? 'Update product information and settings' : 'Create a new product for your catalog'}
                        </p>
                    </div>
                </div>

                <div className="flex items-center space-x-3">
                    {isEditMode && initialData?.slug && (
                        <Link
                            href={`/product/${initialData.slug}`}
                            target="_blank"
                            className="px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-lg hover:border-gray-400 transition-colors font-semibold whitespace-nowrap cursor-pointer flex items-center"
                        >
                            <i className="ri-eye-line mr-2"></i>
                            Preview
                        </Link>
                    )}
                    <button
                        onClick={handleSubmit}
                        disabled={loading}
                        className={`px-6 py-3 bg-gray-900 hover:bg-gray-800 text-white rounded-lg font-semibold transition-colors whitespace-nowrap cursor-pointer flex items-center ${loading ? 'opacity-70 cursor-not-allowed' : ''}`}
                    >
                        {loading ? (
                            <>
                                <i className="ri-loader-4-line animate-spin mr-2"></i>
                                Saving...
                            </>
                        ) : (
                            <>
                                <i className="ri-save-line mr-2"></i>
                                {isEditMode ? 'Save Changes' : 'Create Product'}
                            </>
                        )}
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="border-b border-gray-200 overflow-x-auto">
                    <div className="flex">
                        {tabs.map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex items-center space-x-2 px-6 py-4 font-semibold whitespace-nowrap transition-colors border-b-2 cursor-pointer ${activeTab === tab.id
                                    ? 'border-gray-900 text-gray-900 bg-gray-50'
                                    : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                                    }`}
                            >
                                <i className={`${tab.icon} text-xl`}></i>
                                <span>{tab.label}</span>
                            </button>
                        ))}
                    </div>
                </div>

                <div className="p-8">
                    {activeTab === 'general' && (
                        <div className="space-y-6 max-w-3xl">
                            <div>
                                <label className="block text-sm font-semibold text-gray-900 mb-2">
                                    Product Name *
                                </label>
                                <input
                                    type="text"
                                    value={productName}
                                    onChange={(e) => setProductName(e.target.value)}
                                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600"
                                    placeholder="Enter product name"
                                />
                            </div>

                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="block text-sm font-semibold text-gray-900">
                                        Description
                                    </label>
                                    <button
                                        type="button"
                                        onClick={handleAiDescription}
                                        disabled={aiGenerating}
                                        className={`flex items-center gap-2 px-3 py-1.5 text-sm font-semibold rounded-lg border-2 transition-colors ${
                                            aiGenerating
                                                ? 'border-gray-200 text-gray-400 cursor-not-allowed'
                                                : 'border-gray-300 text-gray-700 hover:border-gray-900 hover:bg-gray-50 cursor-pointer'
                                        }`}
                                    >
                                        <i className={`${aiGenerating ? 'ri-loader-4-line animate-spin' : 'ri-sparkling-line'}`}></i>
                                        {aiGenerating ? 'Generating...' : 'AI Write'}
                                    </button>
                                </div>
                                <textarea
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    rows={6}
                                    maxLength={500}
                                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600 resize-none"
                                    placeholder="Describe your product..."
                                />
                                <p className="text-sm text-gray-500 mt-2">{description.length}/500 characters</p>
                            </div>

                            <div className="grid md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-900 mb-2">
                                        Category *
                                    </label>
                                    <select
                                        value={categoryId}
                                        onChange={(e) => setCategoryId(e.target.value)}
                                        className="w-full px-4 py-3 pr-8 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600 cursor-pointer"
                                    >
                                        {categories.length === 0 && <option value="">Loading categories...</option>}
                                        {categories.length > 0 && <option value="">Select a category</option>}
                                        {categories.map(cat => (
                                            <option key={cat.id} value={cat.id}>{cat.name}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-gray-900 mb-2">
                                        Status
                                    </label>
                                    <select
                                        value={status}
                                        onChange={(e) => setStatus(e.target.value)}
                                        className="w-full px-4 py-3 pr-8 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600 cursor-pointer"
                                    >
                                        <option>Active</option>
                                        <option>Draft</option>
                                        <option>Archived</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-900 mb-2">
                                    Gender / Who is it for?
                                </label>
                                <div className="inline-flex rounded-lg border-2 border-gray-300 overflow-hidden">
                                    {([
                                        { value: 'male', label: 'Male', icon: 'ri-men-line' },
                                        { value: 'female', label: 'Female', icon: 'ri-women-line' },
                                        { value: 'unisex', label: 'Unisex', icon: 'ri-genderless-line' },
                                    ] as const).map((opt, idx) => (
                                        <button
                                            key={opt.value}
                                            type="button"
                                            onClick={() => setGender(opt.value)}
                                            className={`flex items-center gap-2 px-5 py-2.5 text-sm font-semibold transition-colors cursor-pointer ${idx > 0 ? 'border-l-2 border-gray-300' : ''} ${
                                                gender === opt.value
                                                    ? opt.value === 'male'
                                                        ? 'bg-sky-600 text-white'
                                                        : opt.value === 'female'
                                                            ? 'bg-pink-600 text-white'
                                                            : 'bg-gray-800 text-white'
                                                    : 'bg-white text-gray-700 hover:bg-gray-50'
                                            }`}
                                        >
                                            <i className={opt.icon}></i>
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                                <p className="text-xs text-gray-500 mt-2">Used to filter products by gender in the admin and storefront. Choose Unisex if it suits any child.</p>
                            </div>

                            <div className="flex items-center space-x-3">
                                <input
                                    type="checkbox"
                                    checked={featured}
                                    onChange={(e) => setFeatured(e.target.checked)}
                                    className="w-5 h-5 text-gray-900 border-gray-300 rounded focus:ring-gray-600 cursor-pointer"
                                />
                                <label className="text-gray-900 font-medium">
                                    Feature this product on homepage
                                </label>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-900 mb-2">
                                    Pre-order / Estimated Shipping
                                </label>
                                <input
                                    type="text"
                                    value={preorderShipping}
                                    onChange={(e) => setPreorderShipping(e.target.value)}
                                    placeholder="e.g., Ships in 14 days, Available March 15"
                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-600 focus:border-transparent transition-all"
                                />
                                <p className="text-xs text-gray-500 mt-1">Leave empty if product ships immediately. Otherwise, enter estimated shipping time.</p>
                            </div>
                        </div>
                    )}

                    {activeTab === 'pricing' && (
                        <div className="space-y-6 max-w-3xl">
                            <div className="grid md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-900 mb-2">
                                        Price (GH₵) *
                                    </label>
                                    <div className="relative">
                                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 font-semibold">GH₵</span>
                                        <input
                                            type="number"
                                            value={price}
                                            onChange={(e) => setPrice(e.target.value)}
                                            className="w-full pl-16 pr-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600"
                                            step="0.01"
                                            placeholder="0.00"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-gray-900 mb-2">
                                        Compare at Price (GH₵)
                                    </label>
                                    <div className="relative">
                                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 font-semibold">GH₵</span>
                                        <input
                                            type="number"
                                            value={comparePrice}
                                            onChange={(e) => setComparePrice(e.target.value)}
                                            className="w-full pl-16 pr-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600"
                                            step="0.01"
                                            placeholder="0.00"
                                        />
                                    </div>
                                    <p className="text-sm text-gray-500 mt-2">Show original price for comparison (e.g. crossed out when on sale).</p>
                                </div>
                            </div>

                            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                                <p className="text-blue-900 font-semibold mb-1">Discount Calculation</p>
                                {price && comparePrice && parseFloat(comparePrice) > parseFloat(price) ? (
                                    <p className="text-blue-800">
                                        Savings: GH₵ {(parseFloat(comparePrice) - parseFloat(price)).toFixed(2)}
                                        <span className="ml-2">
                                            ({(((parseFloat(comparePrice) - parseFloat(price)) / parseFloat(comparePrice)) * 100).toFixed(0)}% off)
                                        </span>
                                    </p>
                                ) : (
                                    <p className="text-blue-800 text-sm">Enter a compare price higher than the selling price to see discount.</p>
                                )}
                            </div>

                            {/* On Sale toggle - works interchangeably with Compare at Price above */}
                            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border-2 border-gray-200">
                                <div>
                                    <p className="font-semibold text-gray-900">On Sale</p>
                                    <p className="text-sm text-gray-600 mt-0.5">Turn on to mark as sale (or just set Compare at Price above).</p>
                                </div>
                                <button
                                    type="button"
                                    role="switch"
                                    aria-checked={onSale}
                                    onClick={() => {
                                        if (onSale) {
                                            setComparePrice('');
                                        } else {
                                            const p = parseFloat(price);
                                            if (p > 0) setComparePrice(String((p * 1.1).toFixed(2)));
                                        }
                                    }}
                                    className={`relative w-12 h-7 rounded-full transition-colors cursor-pointer ${onSale ? 'bg-gray-900' : 'bg-gray-300'}`}
                                >
                                    <span className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-all ${onSale ? 'left-7' : 'left-1'}`} />
                                </button>
                            </div>

                            {/* Wholesale */}
                            <div className="pt-6 border-t border-gray-200">
                                <h3 className="text-lg font-bold text-gray-900 mb-2">Wholesale (optional)</h3>
                                <p className="text-sm text-gray-600 mb-4">Set a bulk price for customers who order larger quantities.</p>
                                <div className="grid md:grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-900 mb-2">Wholesale Price (GH₵)</label>
                                        <div className="relative">
                                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 font-semibold">GH₵</span>
                                            <input
                                                type="number"
                                                value={wholesalePrice}
                                                onChange={(e) => setWholesalePrice(e.target.value)}
                                                className="w-full pl-16 pr-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600"
                                                step="0.01"
                                                placeholder="0.00"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-900 mb-2">Minimum Quantity for Wholesale</label>
                                        <input
                                            type="number"
                                            value={wholesaleMinQty}
                                            onChange={(e) => setWholesaleMinQty(e.target.value)}
                                            min="2"
                                            className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600"
                                            placeholder="e.g. 10"
                                        />
                                        <p className="text-sm text-gray-500 mt-2">Min. order qty to qualify for wholesale price.</p>
                                    </div>
                                </div>
                            </div>

                            <div className="pt-6 border-t border-gray-200">
                                <h3 className="text-lg font-bold text-gray-900 mb-4">Inventory</h3>

                                <div className="grid md:grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-900 mb-2">
                                            SKU (Auto-generated)
                                        </label>
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                value={sku}
                                                onChange={(e) => setSku(e.target.value)}
                                                className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600 font-mono bg-gray-50"
                                                placeholder="Auto-generated"
                                                readOnly
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setSku(generateSku())}
                                                className="px-4 py-3 border-2 border-gray-300 rounded-lg hover:border-gray-600 hover:bg-gray-50 transition-colors cursor-pointer"
                                                title="Generate new SKU"
                                            >
                                                <i className="ri-refresh-line text-lg"></i>
                                            </button>
                                        </div>
                                        <p className="text-sm text-gray-500 mt-1">SKU is auto-generated. Click refresh to generate a new one.</p>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-semibold text-gray-900 mb-2">
                                            Stock Quantity *
                                        </label>
                                        {variants.length > 0 ? (
                                            <div>
                                                <input
                                                    type="number"
                                                    value={variants.reduce((sum: number, v: any) => sum + (parseInt(v.stock) || 0), 0)}
                                                    readOnly
                                                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed"
                                                />
                                                <p className="text-sm text-amber-600 mt-1 flex items-center">
                                                    <i className="ri-information-line mr-1"></i>
                                                    Stock is managed per variant. Edit stock in the Variants tab.
                                                </p>
                                            </div>
                                        ) : (
                                            <input
                                                type="number"
                                                value={stock}
                                                onChange={(e) => setStock(e.target.value)}
                                                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600"
                                                placeholder="0"
                                            />
                                        )}
                                    </div>
                                </div>

                                <div className="grid md:grid-cols-2 gap-6 mt-6">
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-900 mb-2">
                                            Minimum Order Quantity (MOQ)
                                        </label>
                                        <input
                                            type="number"
                                            value={moq}
                                            onChange={(e) => setMoq(e.target.value)}
                                            min="1"
                                            className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600"
                                            placeholder="1"
                                        />
                                        <p className="text-sm text-gray-500 mt-1">Minimum quantity customers must order</p>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-semibold text-gray-900 mb-2">
                                            Low Stock Threshold
                                        </label>
                                        <input
                                            type="number"
                                            value={lowStockThreshold}
                                            onChange={(e) => setLowStockThreshold(e.target.value)}
                                            className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600"
                                        />
                                        <p className="text-sm text-gray-500 mt-1">Get notified when stock falls below this number</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'variants' && (
                        <div className="space-y-8">
                            <div>
                                <h3 className="text-lg font-bold text-gray-900">Product Variants</h3>
                                <p className="text-gray-600 mt-1">Select ages (sizes) below — variants are generated automatically</p>
                            </div>

                            {SHOW_PRODUCT_COLOR_VARIANTS && (
                            <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                                <h4 className="text-sm font-bold text-gray-900 mb-1 flex items-center">
                                    <i className="ri-palette-line mr-2 text-lg text-gray-900"></i>
                                    Step 1: Select Colors
                                    {selectedColors.length > 0 && (
                                        <span className="ml-2 bg-gray-100 text-gray-800 text-xs font-semibold px-2 py-0.5 rounded-full">
                                            {selectedColors.length} selected
                                        </span>
                                    )}
                                </h4>
                                <p className="text-xs text-gray-500 mb-4">Click colors to add/remove. Skip if product has no color options.</p>

                                <div className="flex flex-wrap gap-2 mb-4">
                                    {colorPresets.map(color => {
                                        const isSelected = selectedColors.some(c => c.name === color.name);
                                        return (
                                            <button
                                                key={color.name}
                                                onClick={() => toggleColor(color)}
                                                className={`flex items-center space-x-2 px-3 py-2 rounded-lg border-2 transition-all text-sm font-medium ${
                                                    isSelected
                                                        ? 'border-gray-700 bg-gray-50 ring-1 ring-gray-700'
                                                        : 'border-gray-200 hover:border-gray-300 bg-white'
                                                }`}
                                                title={color.name}
                                            >
                                                <span
                                                    className="w-5 h-5 rounded-full border border-gray-300 flex-shrink-0"
                                                    style={{ backgroundColor: color.hex }}
                                                ></span>
                                                <span className={isSelected ? 'text-gray-800' : 'text-gray-700'}>{color.name}</span>
                                                {isSelected && <i className="ri-check-line text-gray-900"></i>}
                                            </button>
                                        );
                                    })}
                                </div>

                                {/* Custom color */}
                                <div className="flex items-center gap-2 pt-3 border-t border-gray-200">
                                    <input
                                        type="color"
                                        value={customColorHex}
                                        onChange={(e) => setCustomColorHex(e.target.value)}
                                        className="w-10 h-10 rounded-lg border border-gray-300 cursor-pointer p-0.5"
                                        title="Pick a custom color"
                                    />
                                    <input
                                        type="text"
                                        value={customColorName}
                                        onChange={(e) => setCustomColorName(e.target.value)}
                                        placeholder="Custom color name"
                                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                        onKeyDown={(e) => e.key === 'Enter' && addCustomColor()}
                                    />
                                    <button
                                        onClick={addCustomColor}
                                        disabled={!customColorName.trim()}
                                        className="px-4 py-2 bg-gray-800 text-white rounded-lg text-sm font-medium hover:bg-gray-900 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                    >
                                        Add Color
                                    </button>
                                </div>

                                {/* Selected colors summary */}
                                {selectedColors.length > 0 && (
                                    <div className="mt-4 flex flex-wrap gap-2">
                                        {selectedColors.map(color => (
                                            <span key={color.name} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-full text-sm shadow-sm">
                                                <span className="w-3.5 h-3.5 rounded-full border border-gray-300" style={{ backgroundColor: color.hex }}></span>
                                                {color.name}
                                                <button type="button" onClick={() => { const v = prompt('Edit color name:', color.name); if (v != null && v.trim()) editColor(color.name, v.trim()); }} className="text-gray-400 hover:text-gray-700 ml-0.5" title="Edit name">
                                                    <i className="ri-pencil-line text-sm"></i>
                                                </button>
                                                <button type="button" onClick={() => toggleColor(color)} className="text-gray-400 hover:text-red-500 ml-0.5">
                                                    <i className="ri-close-line text-sm"></i>
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                            )}

                            {/* Ages / sizes */}
                            <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                                <h4 className="text-sm font-bold text-gray-900 mb-1 flex items-center">
                                    <i className="ri-ruler-line mr-2 text-lg text-blue-600"></i>
                                    Step 1: Select ages / sizes
                                    {selectedSizes.length > 0 && (
                                        <span className="ml-2 bg-blue-100 text-blue-800 text-xs font-semibold px-2 py-0.5 rounded-full">
                                            {selectedSizes.length} selected
                                        </span>
                                    )}
                                </h4>
                                <p className="text-xs text-gray-500 mb-4">
                                    Click Age 1–12 to add/remove, or add a custom label (e.g. Age 13, 2–3 yrs, One Size).
                                </p>

                                <div className="flex flex-wrap gap-2 mb-4">
                                    {sizePresets.map(size => {
                                        const isSelected = selectedSizes.includes(size);
                                        return (
                                            <button
                                                key={size}
                                                onClick={() => toggleSize(size)}
                                                className={`px-5 py-2.5 rounded-lg border-2 font-semibold text-sm transition-all ${
                                                    isSelected
                                                        ? 'border-blue-600 bg-blue-50 text-blue-800 ring-1 ring-blue-600'
                                                        : 'border-gray-200 hover:border-gray-300 bg-white text-gray-700'
                                                }`}
                                            >
                                                {size}
                                                {isSelected && <i className="ri-check-line ml-1.5 text-blue-600"></i>}
                                            </button>
                                        );
                                    })}
                                </div>

                                {/* Custom size */}
                                <div className="flex items-center gap-2 pt-3 border-t border-gray-200">
                                    <input
                                        type="text"
                                        value={customSize}
                                        onChange={(e) => setCustomSize(e.target.value)}
                                        placeholder="Custom age or size (e.g. Age 13, 2–3 yrs, One Size)"
                                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                        onKeyDown={(e) => e.key === 'Enter' && addCustomSize()}
                                    />
                                    <button
                                        onClick={addCustomSize}
                                        disabled={!customSize.trim()}
                                        className="px-4 py-2 bg-gray-800 text-white rounded-lg text-sm font-medium hover:bg-gray-900 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                    >
                                        Add Size
                                    </button>
                                </div>

                                {/* Selected sizes — draggable to reorder */}
                                {selectedSizes.length > 0 && (
                                    <DragDropContext onDragEnd={(result: DropResult) => {
                                        if (!result.destination) return;
                                        const reordered = Array.from(selectedSizes);
                                        const [moved] = reordered.splice(result.source.index, 1);
                                        reordered.splice(result.destination.index, 0, moved);
                                        setSelectedSizes(reordered);
                                    }}>
                                        <Droppable droppableId="sizes-list" direction="horizontal">
                                            {(provided) => (
                                                <div className="mt-4 flex flex-wrap gap-2" ref={provided.innerRef} {...provided.droppableProps}>
                                                    {selectedSizes.map((size, idx) => (
                                                        <Draggable key={size} draggableId={`size-${size}`} index={idx}>
                                                            {(dragProvided, snapshot) => (
                                                                <span
                                                                    ref={dragProvided.innerRef}
                                                                    {...dragProvided.draggableProps}
                                                                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border rounded-full text-sm shadow-sm font-medium select-none transition-shadow ${snapshot.isDragging ? 'border-gray-400 shadow-md ring-2 ring-gray-200' : 'border-gray-200'}`}
                                                                >
                                                                    {/* Drag handle is the grip icon ONLY, so the edit/delete buttons stay clickable */}
                                                                    <span
                                                                        {...dragProvided.dragHandleProps}
                                                                        className="cursor-grab active:cursor-grabbing flex items-center text-gray-300 hover:text-gray-500"
                                                                        title="Drag to reorder"
                                                                    >
                                                                        <i className="ri-draggable text-xs"></i>
                                                                    </span>
                                                                    {size}
                                                                    <button type="button" onClick={() => { const v = prompt('Edit option name:', size); if (v != null && v.trim()) editSize(size, v.trim()); }} className="text-gray-400 hover:text-gray-700 ml-0.5" title="Edit name">
                                                                        <i className="ri-pencil-line text-sm"></i>
                                                                    </button>
                                                                    <button type="button" onClick={() => toggleSize(size)} className="text-gray-400 hover:text-red-500 ml-0.5" title="Remove this size">
                                                                        <i className="ri-close-line text-sm"></i>
                                                                    </button>
                                                                </span>
                                                            )}
                                                        </Draggable>
                                                    ))}
                                                    {provided.placeholder}
                                                </div>
                                            )}
                                        </Droppable>
                                    </DragDropContext>
                                )}
                            </div>

                            {/* Variant grid: price & stock */}
                            {variantCombinations.length > 0 && (
                                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                                    <div className="p-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                                        <div>
                                            <h4 className="text-sm font-bold text-gray-900 flex items-center">
                                                <i className="ri-grid-line mr-2 text-lg text-purple-600"></i>
                                                Step 2: Set price & stock ({variantCombinations.length} variant{variantCombinations.length > 1 ? 's' : ''})
                                            </h4>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => {
                                                    const val = prompt('Set price for ALL variants:', price?.toString() || '0');
                                                    if (val !== null) bulkSetField('price', val);
                                                }}
                                                className="px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors"
                                            >
                                                Bulk Set Price
                                            </button>
                                            <button
                                                onClick={() => {
                                                    const val = prompt('Set stock for ALL variants:', '0');
                                                    if (val !== null) bulkSetField('stock', val);
                                                }}
                                                className="px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors"
                                            >
                                                Bulk Set Stock
                                            </button>
                                        </div>
                                    </div>

                                    <div className="overflow-x-auto">
                                        <table className="w-full">
                                            <thead className="bg-gray-50 border-b border-gray-200">
                                                <tr>
                                                    {selectedColors.length > 0 && (
                                                        <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Color</th>
                                                    )}
                                                    {selectedSizes.length > 0 && (
                                                        <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Age / size</th>
                                                    )}
                                                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Variant image</th>
                                                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Price (GH₵)</th>
                                                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Stock</th>
                                                    {selectedColors.length === 0 && (
                                                        <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">Remove</th>
                                                    )}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {variantCombinations.map((combo) => {
                                                    const d = variantData[combo.key] || { price: price, stock: '0', sku: '' };
                                                    return (
                                                        <tr key={combo.key} className="border-b border-gray-100 hover:bg-gray-50">
                                                            {selectedColors.length > 0 && (
                                                                <td className="py-3 px-4">
                                                                    <div className="flex items-center gap-2">
                                                                        <span
                                                                            className="w-5 h-5 rounded-full border border-gray-300 flex-shrink-0"
                                                                            style={{ backgroundColor: combo.colorHex }}
                                                                        ></span>
                                                                        <span className="text-sm font-medium text-gray-900">{combo.color}</span>
                                                                    </div>
                                                                </td>
                                                            )}
                                                            {selectedSizes.length > 0 && (
                                                                <td className="py-3 px-4">
                                                                    <span className="text-sm font-semibold text-gray-900 bg-gray-100 px-2.5 py-1 rounded">
                                                                        {combo.size}
                                                                    </span>
                                                                </td>
                                                            )}
                                                            <td className="py-3 px-4">
                                                                <div className="flex items-center gap-2">
                                                                    {d.image_url ? (
                                                                        <>
                                                                            <img src={d.image_url} alt="" className="w-12 h-12 rounded-lg object-cover border border-gray-200" />
                                                                            <button type="button" onClick={() => setVariantImage(combo.key, '')} className="text-xs text-red-600 hover:underline font-medium">Remove</button>
                                                                        </>
                                                                    ) : (
                                                                        <span className="text-gray-400 text-xs">No image</span>
                                                                    )}
                                                                    <div className="flex flex-col gap-1">
                                                                        <label className="cursor-pointer text-xs font-medium text-gray-700 hover:text-gray-900 flex items-center gap-1">
                                                                            <i className="ri-upload-line"></i> Upload
                                                                            <input
                                                                                type="file"
                                                                                accept=".jpg,.jpeg,.png,.webp"
                                                                                className="hidden"
                                                                                onChange={async (e) => {
                                                                                    const file = e.target.files?.[0];
                                                                                    if (!file) return;
                                                                                    const fd = new FormData();
                                                                                    fd.append('file', file);
                                                                                    fd.append('bucket', 'product-images');
                                                                                    const res = await fetch('/api/admin/upload', { method: 'POST', body: fd, credentials: 'include' });
                                                                                    const data = await res.json().catch(() => ({}));
                                                                                    if (data?.url) setVariantImage(combo.key, data.url);
                                                                                    e.target.value = '';
                                                                                }}
                                                                            />
                                                                        </label>
                                                                        {images.filter((img: any) => img.media_type !== 'video').length > 0 && (
                                                                            <select
                                                                                className="text-xs border border-gray-300 rounded px-2 py-1 text-gray-700"
                                                                                value=""
                                                                                onChange={(e) => { const u = e.target.value; if (u) setVariantImage(combo.key, u); e.target.value = ''; }}
                                                                            >
                                                                                <option value="">Pick from product</option>
                                                                                {images.filter((img: any) => img.media_type !== 'video').map((img: any, idx: number) => (
                                                                                    <option key={idx} value={img.url}>Image {idx + 1}</option>
                                                                                ))}
                                                                            </select>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            <td className="py-3 px-4">
                                                                <input
                                                                    type="number"
                                                                    value={d.price}
                                                                    onChange={(e) => updateVariantField(combo.key, 'price', e.target.value)}
                                                                    className="w-28 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-1 focus:ring-gray-600 focus:border-gray-600"
                                                                    step="0.01"
                                                                    placeholder={price?.toString() || '0'}
                                                                />
                                                            </td>
                                                            <td className="py-3 px-4">
                                                                <input
                                                                    type="number"
                                                                    value={d.stock}
                                                                    onChange={(e) => updateVariantField(combo.key, 'stock', e.target.value)}
                                                                    className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-1 focus:ring-gray-600 focus:border-gray-600"
                                                                    placeholder="0"
                                                                />
                                                            </td>
                                                            {selectedColors.length === 0 && (
                                                                <td className="py-3 px-4 text-right">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => toggleSize(combo.size)}
                                                                        className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                                                        title={`Delete ${combo.size} variant`}
                                                                    >
                                                                        <i className="ri-delete-bin-line text-lg"></i>
                                                                    </button>
                                                                </td>
                                                            )}
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>

                                    <div className="p-3 bg-gray-50 border-t border-gray-100">
                                        <p className="text-xs text-gray-800 flex items-center">
                                            <i className="ri-information-line mr-1.5"></i>
                                            Total stock across all variants: <strong className="ml-1">{variants.reduce((sum, v) => sum + (parseInt(v.stock) || 0), 0)}</strong>
                                        </p>
                                    </div>
                                </div>
                            )}

                            {variantCombinations.length === 0 && (
                                <div className="p-8 text-center text-gray-500 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
                                    <i className="ri-palette-line text-4xl text-gray-300 mb-2 block"></i>
                                    <p className="font-medium">No variants configured</p>
                                    <p className="text-sm mt-1">Select colors and/or sizes above to create variant combinations.</p>
                                    <p className="text-xs mt-2 text-gray-400">You can add just colors, just sizes, or both for a full grid.</p>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'images' && (
                        <div className="space-y-6">
                            <div>
                                <h3 className="text-lg font-bold text-gray-900 mb-1">Product Media</h3>
                                <p className="text-gray-600">Add up to 10 images or videos. First item will be the primary display. Drag images to reorder. <strong className="text-gray-700">Click &quot;Save Changes&quot; after adding images to make them visible to customers.</strong></p>
                            </div>

                            <DragDropContext onDragEnd={handleImageReorder}>
                                <Droppable droppableId="product-images" direction="horizontal">
                                    {(provided) => (
                                        <div
                                            ref={provided.innerRef}
                                            {...provided.droppableProps}
                                            className="grid grid-cols-2 md:grid-cols-4 gap-4"
                                        >
                                            {images.map((img: any, index: number) => {
                                                const isVideo = img.media_type === 'video' || /\.(mp4|mov|webm)$/i.test(img.url);
                                                return (
                                                    <Draggable key={img.url} draggableId={img.url} index={index}>
                                                        {(provided) => (
                                                            <div
                                                                ref={provided.innerRef}
                                                                {...provided.draggableProps}
                                                                {...provided.dragHandleProps}
                                                                className="relative group cursor-grab active:cursor-grabbing"
                                                            >
                                                                <div className="aspect-square bg-gray-100 rounded-xl overflow-hidden border-2 border-gray-200">
                                                                    {isVideo ? (
                                                                        <video src={img.url} className="w-full h-full object-cover" muted preload="metadata" />
                                                                    ) : (
                                                                        <img src={img.url} alt={`Product ${index + 1}`} className="w-full h-full object-cover" />
                                                                    )}
                                                                </div>
                                                                <span className="absolute top-2 left-2 bg-gray-900/80 text-white px-2 py-1 rounded text-xs font-semibold flex items-center gap-1.5">
                                                                    <i className="ri-drag-drop-line"></i>
                                                                    {index === 0 ? 'Primary' : index + 1}
                                                                </span>
                                                                {isVideo && (
                                                                    <span className="absolute top-2 right-2 bg-black/70 text-white px-2 py-1 rounded text-xs font-semibold flex items-center gap-1">
                                                                        <i className="ri-video-line"></i> Video
                                                                    </span>
                                                                )}
                                                                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center space-x-2 rounded-xl">
                                                                    <a href={img.url} target="_blank" rel="noreferrer" className="w-9 h-9 flex items-center justify-center bg-white text-gray-900 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer" onClick={(e) => e.stopPropagation()}>
                                                                        <i className={isVideo ? 'ri-play-line' : 'ri-eye-line'}></i>
                                                                    </a>
                                                                    <button
                                                                        type="button"
                                                                        onClick={(e) => { e.stopPropagation(); handleRemoveImage(index); }}
                                                                        className="w-9 h-9 flex items-center justify-center bg-white text-red-600 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
                                                                    >
                                                                        <i className="ri-delete-bin-line"></i>
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </Draggable>
                                                );
                                            })}
                                            {provided.placeholder}

                                            {/* Add more slot — always visible if under limit */}
                                            {!uploading && images.length < 10 && (
                                    <label className="aspect-square border-2 border-dashed border-gray-300 rounded-xl hover:border-gray-900 hover:bg-gray-50 transition-colors flex flex-col items-center justify-center gap-2 text-gray-500 hover:text-gray-900 cursor-pointer">
                                        <i className="ri-add-line text-3xl"></i>
                                        <span className="text-xs font-semibold text-center px-2 leading-tight">Add photos<br/>or video</span>
                                        {/* Using file extensions (not image/*) forces iOS to open Files app which supports multi-select on all iOS versions */}
                                        <input
                                            type="file"
                                            accept=".jpg,.jpeg,.png,.webp,.heic,.heif,.mp4,.mov,.webm"
                                            multiple
                                            className="hidden"
                                            onChange={handleMediaUpload}
                                        />
                                    </label>
                                )}
                                        </div>
                                    )}
                                </Droppable>
                            </DragDropContext>

                            {/* Action buttons row */}
                            <div className="flex flex-wrap gap-3 items-center">
                                {/* Take Photo — camera only, no multiple needed */}
                                <label className={`flex items-center gap-2 px-4 py-2.5 border-2 border-gray-300 rounded-lg text-sm font-semibold text-gray-700 hover:border-gray-900 hover:bg-gray-50 transition-colors cursor-pointer ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
                                    <i className="ri-camera-line text-lg"></i>
                                    Take Photo
                                    <input
                                        type="file"
                                        accept="image/*"
                                        capture="environment"
                                        className="hidden"
                                        onChange={handleMediaUpload}
                                        disabled={uploading}
                                    />
                                </label>

                                {/* Choose from gallery — file extensions trigger Files app on iOS for reliable multi-select */}
                                <label className={`flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-lg text-sm font-semibold hover:bg-gray-800 transition-colors cursor-pointer ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
                                    <i className="ri-image-add-line text-lg"></i>
                                    Choose from Gallery
                                    <input
                                        type="file"
                                        accept=".jpg,.jpeg,.png,.webp,.heic,.heif,.mp4,.mov,.webm"
                                        multiple
                                        className="hidden"
                                        onChange={handleMediaUpload}
                                        disabled={uploading}
                                    />
                                </label>

                                <span className="text-sm text-gray-400 ml-auto">{images.length}/10</span>
                            </div>

                            {/* Per-file upload progress */}
                            {uploading && uploadProgress.length > 0 && (
                                <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg space-y-2">
                                    <p className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                                        <i className="ri-loader-4-line animate-spin"></i>
                                        Uploading {uploadProgress.filter(p => p.done).length} of {uploadProgress.length} files...
                                    </p>
                                    {uploadProgress.map((p, i) => (
                                        <div key={i} className="flex items-center gap-2 text-sm">
                                            {p.done
                                                ? <i className="ri-check-circle-fill text-green-600"></i>
                                                : <i className="ri-loader-4-line animate-spin text-gray-400"></i>
                                            }
                                            <span className={`truncate max-w-xs ${p.done ? 'text-gray-500' : 'text-gray-800 font-medium'}`}>{p.name}</span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg space-y-1">
                                <p className="text-sm font-semibold text-blue-900 flex items-center gap-1">
                                    <i className="ri-smartphone-line"></i> On iPhone / Android
                                </p>
                                <p className="text-sm text-blue-800">
                                    Tap <strong>Choose from Gallery</strong> → your Files app opens → tap <strong>Select</strong> (top-right) → tap all the photos you want → tap <strong>Open</strong>. All selected photos upload at once.
                                </p>
                                <p className="text-xs text-blue-700 mt-1">Images: JPG, PNG, WebP, HEIC (max 5MB each) · Videos: MP4, MOV, WebM (max 100MB each)</p>
                            </div>
                        </div>
                    )}

                    {activeTab === 'cop' && (
                        <div className="space-y-6 max-w-3xl">
                            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                                <div>
                                    <h3 className="text-lg font-bold text-gray-900 mb-1">Cost of production (COP)</h3>
                                    <p className="text-gray-600 text-sm">
                                        Optional. Track fabric, trims, and labour per garment. Link a production team member for payroll-style totals when you log completed pieces under{' '}
                                        <Link href="/admin/finance" className="text-brand-greenDark font-semibold underline">
                                            Finance
                                        </Link>
                                        .
                                    </p>
                                </div>
                                <label className="flex items-center gap-2 cursor-pointer shrink-0">
                                    <input
                                        type="checkbox"
                                        checked={copEnabled}
                                        onChange={(e) => setCopEnabled(e.target.checked)}
                                        className="rounded border-gray-300 w-4 h-4"
                                    />
                                    <span className="text-sm font-semibold text-gray-800">Enable COP for this product</span>
                                </label>
                            </div>

                            {!copEnabled ? (
                                <p className="text-sm text-gray-500 py-6 border border-dashed border-gray-200 rounded-xl px-4 text-center">
                                    Turn on COP to record costs and staff attribution for this style.
                                </p>
                            ) : (
                                <>
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-900 mb-2">Description / notes</label>
                                        <textarea
                                            rows={3}
                                            value={copDescription}
                                            onChange={(e) => setCopDescription(e.target.value)}
                                            className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600 resize-none"
                                            placeholder="e.g. 2 yards wax print, lining navy, zip 8&quot;, elastic waist…"
                                        />
                                    </div>

                                    <div>
                                        <div className="flex items-baseline justify-between gap-4 mb-2">
                                            <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Default per-unit cost</h4>
                                            <span className="text-xs text-gray-500">Applies to every variant unless you override below</span>
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                            <div>
                                                <label className="block text-sm font-semibold text-gray-900 mb-2">Fabric cost (GH₵)</label>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="0.01"
                                                    value={fabricCost}
                                                    onChange={(e) => setFabricCost(e.target.value)}
                                                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600"
                                                    placeholder="0.00"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-semibold text-gray-900 mb-2">Other costs (GH₵)</label>
                                                <p className="text-xs text-gray-500 mb-1">Lining, net, zip, elastic, etc.</p>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="0.01"
                                                    value={otherCost}
                                                    onChange={(e) => setOtherCost(e.target.value)}
                                                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600"
                                                    placeholder="0.00"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-semibold text-gray-900 mb-2">Labour cost (GH₵)</label>
                                                <p className="text-xs text-gray-500 mb-1">Per unit (one garment)</p>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="0.01"
                                                    value={labourCost}
                                                    onChange={(e) => setLabourCost(e.target.value)}
                                                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600"
                                                    placeholder="0.00"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-semibold text-gray-900 mb-2">Production staff</label>
                                        <p className="text-xs text-gray-500 mb-2">
                                            Who typically makes this piece (used as default; you can still log production by anyone).
                                        </p>
                                        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                                            <select
                                                value={productionStaffId}
                                                onChange={(e) => setProductionStaffId(e.target.value)}
                                                className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600 bg-white"
                                            >
                                                <option value="">— None —</option>
                                                {productionStaff.map((s) => (
                                                    <option key={s.id} value={s.id}>
                                                        {s.full_name}
                                                    </option>
                                                ))}
                                            </select>
                                            <Link
                                                href="/admin/finance/staff"
                                                className="inline-flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold text-brand-greenDark border-2 border-brand-green/30 rounded-lg hover:bg-brand-greenLight"
                                            >
                                                <i className="ri-team-line" />
                                                Manage team
                                            </Link>
                                        </div>
                                    </div>

                                    {/* Per-variant overrides — opt-in, hidden until needed */}
                                    {variantCombinations.length === 0 ? (
                                        <div className="rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 p-5 flex items-start gap-3">
                                            <i className="ri-information-line text-lg text-gray-400 mt-0.5" />
                                            <div className="text-sm text-gray-600">
                                                <p className="font-semibold text-gray-800 mb-1">Want different costs per size (e.g. Age 1 vs Age 12)?</p>
                                                <p>
                                                    Head over to the{' '}
                                                    <button
                                                        type="button"
                                                        onClick={() => setActiveTab('variants')}
                                                        className="text-brand-greenDark font-semibold underline"
                                                    >
                                                        Variants tab
                                                    </button>
                                                    {' '}and add your sizes/colours first. The moment you do, a per-variant cost table will appear here so you can override the defaults above for any variant that costs more (or less) to make.
                                                </p>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="rounded-xl border-2 border-gray-200 p-5 space-y-4">
                                            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                                                <div>
                                                    <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Per-variant cost</h4>
                                                    <p className="text-xs text-gray-500 mt-1 max-w-xl">
                                                        Larger sizes often use more fabric or labour. Turn this on to override any of the default costs for specific variants. Empty fields inherit the defaults above. Each variant&apos;s cost is multiplied by its stock to get the inventory totals on the right.
                                                    </p>
                                                </div>
                                                <label className="flex items-center gap-2 cursor-pointer shrink-0">
                                                    <input
                                                        type="checkbox"
                                                        checked={perVariantCopEnabled}
                                                        onChange={(e) => setPerVariantCopEnabled(e.target.checked)}
                                                        className="rounded border-gray-300 w-4 h-4"
                                                    />
                                                    <span className="text-sm font-semibold text-gray-800">Different costs per variant</span>
                                                </label>
                                            </div>

                                            {perVariantCopEnabled && (() => {
                                                const defF = parseFloat(fabricCost) || 0;
                                                const defO = parseFloat(otherCost) || 0;
                                                const defL = parseFloat(labourCost) || 0;
                                                const defaultUnit = defF + defO + defL;

                                                const overriddenCount = variantCombinations.filter((c) => {
                                                    const ov = perVariantCosts[c.key];
                                                    return ov && (ov.fabric || ov.other || ov.labour);
                                                }).length;

                                                const updateOverride = (key: string, field: 'fabric' | 'other' | 'labour', value: string) => {
                                                    setPerVariantCosts((prev) => {
                                                        const existing = prev[key] || { fabric: '', other: '', labour: '' };
                                                        return { ...prev, [key]: { ...existing, [field]: value } };
                                                    });
                                                };
                                                const resetRow = (key: string) => {
                                                    setPerVariantCosts((prev) => {
                                                        const next = { ...prev };
                                                        delete next[key];
                                                        return next;
                                                    });
                                                };
                                                const applyDefaultsToAll = () => {
                                                    if (!fabricCost && !otherCost && !labourCost) return;
                                                    const seed: Record<string, VariantCostInput> = {};
                                                    for (const c of variantCombinations) {
                                                        seed[c.key] = {
                                                            fabric: fabricCost || '',
                                                            other: otherCost || '',
                                                            labour: labourCost || '',
                                                        };
                                                    }
                                                    setPerVariantCosts(seed);
                                                };
                                                const clearAll = () => setPerVariantCosts({});

                                                return (
                                                    <div className="space-y-3">
                                                        <div className="flex flex-wrap items-center gap-2 text-xs">
                                                            <span className="text-gray-500">
                                                                {overriddenCount > 0
                                                                    ? `${overriddenCount} of ${variantCombinations.length} variants have an override`
                                                                    : `${variantCombinations.length} variants — none overridden yet`}
                                                            </span>
                                                            <div className="flex gap-2 ml-auto">
                                                                <button
                                                                    type="button"
                                                                    onClick={applyDefaultsToAll}
                                                                    disabled={!fabricCost && !otherCost && !labourCost}
                                                                    className="px-3 py-1.5 rounded-md border border-gray-300 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                                                                    title="Pre-fill every row with the default values so you can tweak from there"
                                                                >
                                                                    <i className="ri-magic-line mr-1" />
                                                                    Pre-fill from defaults
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={clearAll}
                                                                    disabled={overriddenCount === 0}
                                                                    className="px-3 py-1.5 rounded-md border border-gray-300 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                                                                >
                                                                    Clear all overrides
                                                                </button>
                                                            </div>
                                                        </div>

                                                        <div className="overflow-x-auto -mx-5 sm:mx-0">
                                                            <table className="w-full text-sm">
                                                                <thead>
                                                                    <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
                                                                        <th className="font-semibold py-2 pl-5 sm:pl-3 pr-2">Variant</th>
                                                                        <th className="font-semibold py-2 px-2">Stock</th>
                                                                        <th className="font-semibold py-2 px-2">Fabric</th>
                                                                        <th className="font-semibold py-2 px-2">Other</th>
                                                                        <th className="font-semibold py-2 px-2">Labour</th>
                                                                        <th className="font-semibold py-2 px-2 text-right">Per-unit</th>
                                                                        <th className="font-semibold py-2 px-2 text-right">Inventory cost</th>
                                                                        <th className="font-semibold py-2 pr-5 sm:pr-3 pl-2"></th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {variantCombinations.map((c) => {
                                                                        const ov = perVariantCosts[c.key];
                                                                        const fabric = ov?.fabric ? parseFloat(ov.fabric) : defF;
                                                                        const other = ov?.other ? parseFloat(ov.other) : defO;
                                                                        const labour = ov?.labour ? parseFloat(ov.labour) : defL;
                                                                        const unit = (Number.isFinite(fabric) ? fabric : 0)
                                                                            + (Number.isFinite(other) ? other : 0)
                                                                            + (Number.isFinite(labour) ? labour : 0);
                                                                        const variantStock = parseInt(variantData[c.key]?.stock || '0') || 0;
                                                                        const inventoryCost = unit * variantStock;
                                                                        const hasOverride = !!(ov && (ov.fabric || ov.other || ov.labour));
                                                                        const label = c.color && c.size
                                                                            ? `${c.color} · ${c.size}`
                                                                            : c.size || c.color || 'Default';

                                                                        return (
                                                                            <tr key={c.key} className="border-b border-gray-100 last:border-b-0 align-middle">
                                                                                <td className="py-2 pl-5 sm:pl-3 pr-2">
                                                                                    <div className="flex items-center gap-2">
                                                                                        {c.colorHex && (
                                                                                            <span
                                                                                                className="w-3 h-3 rounded-full border border-gray-300 shrink-0"
                                                                                                style={{ backgroundColor: c.colorHex }}
                                                                                            />
                                                                                        )}
                                                                                        <span className="font-medium text-gray-900 whitespace-nowrap">{label}</span>
                                                                                        {hasOverride && (
                                                                                            <span className="text-[10px] font-bold uppercase tracking-wide text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                                                                                                Custom
                                                                                            </span>
                                                                                        )}
                                                                                    </div>
                                                                                </td>
                                                                                <td className="py-2 px-2 text-gray-700 whitespace-nowrap">{variantStock}</td>
                                                                                <td className="py-2 px-2">
                                                                                    <input
                                                                                        type="number"
                                                                                        min="0"
                                                                                        step="0.01"
                                                                                        value={ov?.fabric || ''}
                                                                                        onChange={(e) => updateOverride(c.key, 'fabric', e.target.value)}
                                                                                        placeholder={fabricCost ? `${defF}` : '—'}
                                                                                        className="w-20 px-2 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-1 focus:ring-gray-600 focus:border-gray-600"
                                                                                    />
                                                                                </td>
                                                                                <td className="py-2 px-2">
                                                                                    <input
                                                                                        type="number"
                                                                                        min="0"
                                                                                        step="0.01"
                                                                                        value={ov?.other || ''}
                                                                                        onChange={(e) => updateOverride(c.key, 'other', e.target.value)}
                                                                                        placeholder={otherCost ? `${defO}` : '—'}
                                                                                        className="w-20 px-2 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-1 focus:ring-gray-600 focus:border-gray-600"
                                                                                    />
                                                                                </td>
                                                                                <td className="py-2 px-2">
                                                                                    <input
                                                                                        type="number"
                                                                                        min="0"
                                                                                        step="0.01"
                                                                                        value={ov?.labour || ''}
                                                                                        onChange={(e) => updateOverride(c.key, 'labour', e.target.value)}
                                                                                        placeholder={labourCost ? `${defL}` : '—'}
                                                                                        className="w-20 px-2 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-1 focus:ring-gray-600 focus:border-gray-600"
                                                                                    />
                                                                                </td>
                                                                                <td className="py-2 px-2 text-right font-semibold text-gray-900 whitespace-nowrap">
                                                                                    {unit > 0 ? `GH₵ ${unit.toFixed(2)}` : '—'}
                                                                                </td>
                                                                                <td className="py-2 px-2 text-right text-gray-900 whitespace-nowrap">
                                                                                    {variantStock > 0 && unit > 0 ? `GH₵ ${inventoryCost.toFixed(2)}` : '—'}
                                                                                </td>
                                                                                <td className="py-2 pr-5 sm:pr-3 pl-2 text-right">
                                                                                    {hasOverride && (
                                                                                        <button
                                                                                            type="button"
                                                                                            onClick={() => resetRow(c.key)}
                                                                                            className="text-xs font-semibold text-gray-500 hover:text-gray-900 underline"
                                                                                            title="Reset this variant to use the default costs"
                                                                                        >
                                                                                            Reset
                                                                                        </button>
                                                                                    )}
                                                                                </td>
                                                                            </tr>
                                                                        );
                                                                    })}
                                                                </tbody>
                                                                {defaultUnit > 0 && (
                                                                    <tfoot>
                                                                        <tr className="border-t-2 border-gray-200 bg-gray-50/60">
                                                                            <td colSpan={5} className="py-2 pl-5 sm:pl-3 pr-2 text-xs text-gray-500">
                                                                                Default per-unit cost
                                                                            </td>
                                                                            <td className="py-2 px-2 text-right font-semibold text-gray-900 whitespace-nowrap">
                                                                                GH₵ {defaultUnit.toFixed(2)}
                                                                            </td>
                                                                            <td colSpan={2} />
                                                                        </tr>
                                                                    </tfoot>
                                                                )}
                                                            </table>
                                                        </div>
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    )}

                                    {(() => {
                                        const f = parseFloat(fabricCost) || 0;
                                        const o = parseFloat(otherCost) || 0;
                                        const l = parseFloat(labourCost) || 0;
                                        const gross = f + o + l;

                                        // Pull the retail price from Pricing & Inventory.
                                        // If the product is variant-priced (base price empty/0), fall back
                                        // to the variant prices so the cashier still sees a real margin.
                                        const basePrice = parseFloat(String(price)) || 0;
                                        const variantPrices = variants
                                            .map((v) => parseFloat(String(v.price)) || 0)
                                            .filter((n) => n > 0);
                                        const minVariant = variantPrices.length ? Math.min(...variantPrices) : 0;
                                        const maxVariant = variantPrices.length ? Math.max(...variantPrices) : 0;

                                        let sale = 0;
                                        let priceSource: 'product' | 'variant-single' | 'variant-range' | 'none' = 'none';
                                        let priceLabel = '';
                                        if (basePrice > 0) {
                                            sale = basePrice;
                                            priceSource = 'product';
                                            priceLabel = `GH₵ ${sale.toFixed(2)}`;
                                        } else if (variantPrices.length > 0) {
                                            sale = minVariant;
                                            if (minVariant === maxVariant) {
                                                priceSource = 'variant-single';
                                                priceLabel = `GH₵ ${sale.toFixed(2)}`;
                                            } else {
                                                priceSource = 'variant-range';
                                                priceLabel = `GH₵ ${minVariant.toFixed(2)} – GH₵ ${maxVariant.toFixed(2)}`;
                                            }
                                        } else {
                                            priceLabel = 'Set price first';
                                        }

                                        const profit = sale > 0 ? sale - gross : 0;
                                        const margin = sale > 0 ? (profit / sale) * 100 : null;

                                        const sourceHint = priceSource === 'product'
                                            ? 'Pulled from Pricing & Inventory.'
                                            : priceSource === 'variant-single'
                                                ? 'Pulled from your variant prices (Variants tab).'
                                                : priceSource === 'variant-range'
                                                    ? 'Variant prices vary — margin is calculated on the lowest variant price (worst case).'
                                                    : 'Add a base price in Pricing & Inventory or variant prices in the Variants tab to see margin.';

                                        // Inventory totals — multiply each variant's per-unit cost (with
                                        // any override) by its current stock, and value the same units at
                                        // their variant retail price (falling back to the base price).
                                        const baseStock = parseInt(String(stock || '0')) || 0;
                                        let totalUnits = 0;
                                        let totalInventoryCost = 0;
                                        let totalInventoryRetail = 0;
                                        const baseUnitCost = gross;
                                        if (variantCombinations.length > 0) {
                                            for (const c of variantCombinations) {
                                                const ov = perVariantCopEnabled ? perVariantCosts[c.key] : undefined;
                                                const fabric = ov?.fabric ? parseFloat(ov.fabric) : f;
                                                const other = ov?.other ? parseFloat(ov.other) : o;
                                                const labour = ov?.labour ? parseFloat(ov.labour) : l;
                                                const unitCost = (Number.isFinite(fabric) ? fabric : 0)
                                                    + (Number.isFinite(other) ? other : 0)
                                                    + (Number.isFinite(labour) ? labour : 0);
                                                const variantStock = parseInt(variantData[c.key]?.stock || '0') || 0;
                                                const variantPrice = parseFloat(variantData[c.key]?.price || '') || basePrice;
                                                totalUnits += variantStock;
                                                totalInventoryCost += unitCost * variantStock;
                                                totalInventoryRetail += variantPrice * variantStock;
                                            }
                                        } else {
                                            totalUnits = baseStock;
                                            totalInventoryCost = baseUnitCost * baseStock;
                                            totalInventoryRetail = basePrice * baseStock;
                                        }
                                        const totalInventoryProfit = totalInventoryRetail - totalInventoryCost;
                                        const totalInventoryMargin = totalInventoryRetail > 0
                                            ? (totalInventoryProfit / totalInventoryRetail) * 100
                                            : null;
                                        const overrideCount = perVariantCopEnabled
                                            ? variantCombinations.filter((c) => {
                                                const ov = perVariantCosts[c.key];
                                                return ov && (ov.fabric || ov.other || ov.labour);
                                            }).length
                                            : 0;

                                        return (
                                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                                {/* Per-unit summary */}
                                                <div className="rounded-xl border-2 border-gray-200 bg-gray-50 p-5 space-y-3">
                                                    <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Per-unit margin</h4>
                                                    <dl className="space-y-2 text-sm">
                                                        <div className="flex justify-between gap-4 border-b border-gray-200 pb-2">
                                                            <dt className="text-gray-600">Default gross cost</dt>
                                                            <dd className="font-semibold text-gray-900">GH₵ {gross.toFixed(2)}</dd>
                                                        </div>
                                                        <div className="flex justify-between gap-4 border-b border-gray-200 pb-2">
                                                            <dt className="text-gray-600">Retail price</dt>
                                                            <dd className={`font-semibold ${sale > 0 ? 'text-gray-900' : 'text-gray-400'}`}>{priceLabel}</dd>
                                                        </div>
                                                        <div className="flex justify-between gap-4 border-b border-gray-200 pb-2">
                                                            <dt className="text-gray-600">Gross profit / unit</dt>
                                                            <dd className={`font-semibold ${profit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                                                                {sale > 0 ? `GH₵ ${profit.toFixed(2)}` : '—'}
                                                            </dd>
                                                        </div>
                                                        <div className="flex justify-between gap-4 pb-1">
                                                            <dt className="text-gray-600">Margin</dt>
                                                            <dd className="font-semibold text-gray-900">
                                                                {margin != null ? `${margin.toFixed(1)}%` : '—'}
                                                            </dd>
                                                        </div>
                                                    </dl>
                                                    <p className="text-xs text-gray-500 flex items-start gap-1.5 pt-1">
                                                        <i className="ri-information-line mt-0.5" />
                                                        <span>{sourceHint}</span>
                                                    </p>
                                                </div>

                                                {/* Inventory-on-hand summary */}
                                                <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50/40 p-5 space-y-3">
                                                    <div className="flex items-baseline justify-between gap-3">
                                                        <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Inventory on hand</h4>
                                                        {overrideCount > 0 && (
                                                            <span className="text-[10px] font-bold uppercase tracking-wide text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded">
                                                                {overrideCount} override{overrideCount === 1 ? '' : 's'}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <dl className="space-y-2 text-sm">
                                                        <div className="flex justify-between gap-4 border-b border-emerald-200/70 pb-2">
                                                            <dt className="text-gray-600">Total units in stock</dt>
                                                            <dd className="font-semibold text-gray-900">{totalUnits.toLocaleString()}</dd>
                                                        </div>
                                                        <div className="flex justify-between gap-4 border-b border-emerald-200/70 pb-2">
                                                            <dt className="text-gray-600">Total cost (cost × stock)</dt>
                                                            <dd className="font-semibold text-gray-900">
                                                                {totalUnits > 0 ? `GH₵ ${totalInventoryCost.toFixed(2)}` : '—'}
                                                            </dd>
                                                        </div>
                                                        <div className="flex justify-between gap-4 border-b border-emerald-200/70 pb-2">
                                                            <dt className="text-gray-600">Total retail value</dt>
                                                            <dd className="font-semibold text-gray-900">
                                                                {totalUnits > 0 && totalInventoryRetail > 0 ? `GH₵ ${totalInventoryRetail.toFixed(2)}` : '—'}
                                                            </dd>
                                                        </div>
                                                        <div className="flex justify-between gap-4 border-b border-emerald-200/70 pb-2">
                                                            <dt className="text-gray-600">Potential gross profit</dt>
                                                            <dd className={`font-semibold ${totalInventoryProfit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                                                                {totalUnits > 0 && totalInventoryRetail > 0 ? `GH₵ ${totalInventoryProfit.toFixed(2)}` : '—'}
                                                            </dd>
                                                        </div>
                                                        <div className="flex justify-between gap-4 pb-1">
                                                            <dt className="text-gray-600">Margin</dt>
                                                            <dd className="font-semibold text-gray-900">
                                                                {totalInventoryMargin != null ? `${totalInventoryMargin.toFixed(1)}%` : '—'}
                                                            </dd>
                                                        </div>
                                                    </dl>
                                                    <p className="text-xs text-gray-500 flex items-start gap-1.5 pt-1">
                                                        <i className="ri-information-line mt-0.5" />
                                                        <span>
                                                            Calculated from your current stock × per-unit cost (using overrides where set) and your variant retail prices.
                                                        </span>
                                                    </p>
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </>
                            )}
                        </div>
                    )}

                    {activeTab === 'seo' && (
                        <div className="space-y-6 max-w-3xl">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <h3 className="text-lg font-bold text-gray-900 mb-1">Search Engine Optimization</h3>
                                    <p className="text-gray-600 text-sm">Auto-generated from your product name and description. You can edit any field manually.</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        const { title, metaDesc, kw } = generateSeoFields(productName, description);
                                        setSeoTitle(title);
                                        setMetaDescription(metaDesc);
                                        setKeywords(kw);
                                        if (productName) setUrlSlug(productName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, ''));
                                        setSeoTitleEdited(false);
                                        setMetaDescEdited(false);
                                        setKeywordsEdited(false);
                                    }}
                                    className="flex-shrink-0 flex items-center gap-2 px-4 py-2 border-2 border-gray-300 rounded-lg text-sm font-semibold text-gray-700 hover:border-gray-900 hover:bg-gray-50 transition-colors"
                                >
                                    <i className="ri-refresh-line"></i>
                                    Regenerate
                                </button>
                            </div>

                            {/* Google preview */}
                            {(seoTitle || metaDescription) && (
                                <div className="p-4 bg-white border-2 border-gray-100 rounded-xl">
                                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Google Preview</p>
                                    <p className="text-blue-700 text-base font-medium leading-snug truncate">{seoTitle || productName}</p>
                                    <p className="text-green-700 text-xs mt-0.5">frebysfashion.com/product/{urlSlug}</p>
                                    <p className="text-gray-600 text-sm mt-1 line-clamp-2">{metaDescription}</p>
                                </div>
                            )}

                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-sm font-semibold text-gray-900">Page Title</label>
                                    <span className={`text-xs font-medium ${seoTitle.length > 60 ? 'text-red-500' : seoTitle.length > 50 ? 'text-amber-500' : 'text-gray-400'}`}>
                                        {seoTitle.length}/60
                                    </span>
                                </div>
                                <input
                                    type="text"
                                    value={seoTitle}
                                    onChange={(e) => { setSeoTitle(e.target.value); setSeoTitleEdited(true); }}
                                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600"
                                    placeholder="e.g. Ankara Party Dress | Freby’s Fashion GH"
                                />
                            </div>

                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-sm font-semibold text-gray-900">Meta Description</label>
                                    <span className={`text-xs font-medium ${metaDescription.length > 160 ? 'text-red-500' : metaDescription.length > 140 ? 'text-amber-500' : 'text-gray-400'}`}>
                                        {metaDescription.length}/160
                                    </span>
                                </div>
                                <textarea
                                    rows={3}
                                    value={metaDescription}
                                    onChange={(e) => { setMetaDescription(e.target.value); setMetaDescEdited(true); }}
                                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600 resize-none"
                                    placeholder="e.g. Shop premium kids Ankara outfits at Freby’s Fashion GH. Worldwide delivery available."
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-900 mb-2">
                                    URL Slug
                                </label>
                                <div className="flex items-center">
                                    <span className="text-gray-600 bg-gray-100 px-4 py-3 border-2 border-r-0 border-gray-300 rounded-l-lg whitespace-nowrap text-sm">
                                        /product/
                                    </span>
                                    <input
                                        type="text"
                                        value={urlSlug}
                                        onChange={(e) => setUrlSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/(^-|-$)+/g, ''))}
                                        className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-r-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600"
                                        placeholder="product-slug"
                                    />
                                </div>
                                <p className="text-xs text-gray-400 mt-1">Only lowercase letters, numbers and hyphens. Auto-sanitised as you type.</p>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-900 mb-2">
                                    Keywords
                                </label>
                                <input
                                    type="text"
                                    value={keywords}
                                    onChange={(e) => { setKeywords(e.target.value); setKeywordsEdited(true); }}
                                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600"
                                    placeholder="e.g. lash bed, beauty tools, ghana"
                                />
                                <p className="text-xs text-gray-400 mt-1">Separate with commas. Auto-generated from product name.</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
