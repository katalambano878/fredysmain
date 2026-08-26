'use client';

import {
    createContext,
    useContext,
    useEffect,
    useRef,
    useState,
    useCallback,
    ReactNode,
} from 'react';
import { trackAddToCart } from '@/lib/meta-pixel';

export type CartItem = {
    id: string;
    name: string;
    price: number;
    image: string;
    quantity: number;
    variant?: string;
    /** product_variants.id when a size/color option was selected */
    variantId?: string;
    slug: string;
    maxStock: number;
    moq?: number;
    isPreorder?: boolean;
};

type CartContextType = {
    cart: CartItem[];
    addToCart: (item: CartItem) => void;
    removeFromCart: (itemId: string, variant?: string) => void;
    updateQuantity: (itemId: string, quantity: number, variant?: string) => void;
    clearCart: () => void;
    /** Re-fetch live sale prices for cart lines (variants / products). */
    syncCartPrices: () => Promise<void>;
    cartCount: number;
    subtotal: number;
    isCartOpen: boolean;
    setIsCartOpen: (isOpen: boolean) => void;
    /** False until storage has been read */
    isHydrated: boolean;
};

const CartContext = createContext<CartContextType | undefined>(undefined);

const CART_KEY = 'cart';
const CART_BACKUP_KEY = 'frebys_cart_v1';

function isValidUUID(str: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

function persistCart(items: CartItem[]) {
    if (typeof window === 'undefined') return;
    const payload = JSON.stringify(items);
    try {
        localStorage.setItem(CART_KEY, payload);
        localStorage.setItem(CART_BACKUP_KEY, payload);
        sessionStorage.setItem(CART_BACKUP_KEY, payload);
        window.dispatchEvent(new Event('cartUpdated'));
    } catch {
        try {
            sessionStorage.setItem(CART_BACKUP_KEY, payload);
        } catch {
            /* private mode */
        }
    }
}

function sanitizeCart(parsed: unknown): CartItem[] {
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item: any) => {
        if (!item?.id || !item.name || item.price == null || Number(item.price) < 0) {
            return false;
        }
        if (!isValidUUID(String(item.id))) {
            console.warn(`Removing legacy cart item with non-UUID id: ${item.id}`);
            return false;
        }
        if (!item.slug) item.slug = item.id;
        item.price = Number(item.price);
        item.quantity = Math.max(1, Math.floor(Number(item.quantity) || 1));
        return true;
    });
}

export function readStoredCart(): CartItem[] {
    if (typeof window === 'undefined') return [];
    const sources = [
        () => localStorage.getItem(CART_KEY),
        () => localStorage.getItem(CART_BACKUP_KEY),
        () => sessionStorage.getItem(CART_BACKUP_KEY),
    ];
    for (const get of sources) {
        try {
            const raw = get();
            if (!raw) continue;
            const items = sanitizeCart(JSON.parse(raw));
            if (items.length > 0) return items;
            // empty array is a valid cleared cart — prefer primary key only
            if (get === sources[0]) return [];
        } catch {
            /* try next */
        }
    }
    return [];
}

function mergeAdd(prevCart: CartItem[], newItem: CartItem): CartItem[] {
    const existingItemIndex = prevCart.findIndex(
        (item) =>
            item.id === newItem.id &&
            item.variant === newItem.variant &&
            (item.variantId || '') === (newItem.variantId || '')
    );

    if (existingItemIndex > -1) {
        const next = [...prevCart];
        const existingItem = next[existingItemIndex];
        const maxStock = newItem.maxStock || existingItem.maxStock || 50;
        const newQuantity = Math.min(
            existingItem.quantity + newItem.quantity,
            maxStock
        );
        // Always refresh price/stock from the latest add — sale prices change in admin
        next[existingItemIndex] = {
            ...existingItem,
            quantity: newQuantity,
            price: Number(newItem.price) >= 0 ? Number(newItem.price) : existingItem.price,
            maxStock,
            variantId: newItem.variantId || existingItem.variantId,
            image: newItem.image || existingItem.image,
            isPreorder: newItem.isPreorder ?? existingItem.isPreorder,
            moq: newItem.moq ?? existingItem.moq,
        };
        return next;
    }
    return [...prevCart, newItem];
}

export function CartProvider({ children }: { children: ReactNode }) {
    const [cart, setCart] = useState<CartItem[]>([]);
    const [isCartOpen, setIsCartOpen] = useState(false);
    const [isHydrated, setIsHydrated] = useState(false);
    const cartRef = useRef<CartItem[]>([]);

    useEffect(() => {
        const stored = readStoredCart();
        cartRef.current = stored;
        setCart(stored);
        if (stored.length > 0) persistCart(stored);
        setIsHydrated(true);
    }, []);

    const addToCart = (newItem: CartItem) => {
        // Persist BEFORE setState — React may defer the updater until after navigation
        const next = mergeAdd(cartRef.current, newItem);
        cartRef.current = next;
        persistCart(next);
        setCart(next);
        setIsCartOpen(true);
        try {
            trackAddToCart({
                id: newItem.id,
                name: newItem.name,
                price: Number(newItem.price) || 0,
                quantity: Number(newItem.quantity) || 1,
            });
        } catch {
            /* analytics must not break cart */
        }
    };

    const removeFromCart = (itemId: string, variant?: string) => {
        const next = cartRef.current.filter(
            (item) => !(item.id === itemId && item.variant === variant)
        );
        cartRef.current = next;
        persistCart(next);
        setCart(next);
    };

    const updateQuantity = (itemId: string, quantity: number, variant?: string) => {
        const item = cartRef.current.find((i) => i.id === itemId && i.variant === variant);
        if (!item) return;

        const minQty = item.moq || 1;
        let next: CartItem[];
        if (quantity < minQty) {
            next = cartRef.current.filter(
                (i) => !(i.id === itemId && i.variant === variant)
            );
        } else {
            const clampedQty = Math.min(Math.max(quantity, minQty), item.maxStock);
            next = cartRef.current.map((i) =>
                i.id === itemId && i.variant === variant
                    ? { ...i, quantity: clampedQty }
                    : i
            );
        }
        cartRef.current = next;
        persistCart(next);
        setCart(next);
    };

    const clearCart = () => {
        cartRef.current = [];
        persistCart([]);
        setCart([]);
    };

    const syncCartPrices = useCallback(async () => {
        const current = cartRef.current;
        if (current.length === 0) return;

        const next = await Promise.all(
            current.map(async (item) => {
                const slugOrId = item.slug || item.id;
                if (!slugOrId) return item;
                try {
                    const res = await fetch(
                        `/api/storefront/products/${encodeURIComponent(slugOrId)}`,
                        { cache: 'no-store' }
                    );
                    if (!res.ok) return item;
                    const data = await res.json();
                    const product = data?.product || data;
                    if (!product) return item;

                    const variants = product.product_variants || product.variants || [];
                    let livePrice = Number(product.price);
                    let liveStock = Number(product.quantity ?? product.stockCount ?? item.maxStock);

                    if (item.variantId && Array.isArray(variants)) {
                        const v = variants.find((x: any) => String(x.id) === String(item.variantId));
                        if (v) {
                            livePrice = Number(v.price);
                            liveStock = Number(v.quantity ?? v.stock ?? liveStock);
                        }
                    } else if (item.variant && Array.isArray(variants) && variants.length > 0) {
                        const want = String(item.variant).trim().toLowerCase();
                        const v = variants.find((x: any) => {
                            const label = [x.name, x.option1, x.option2]
                                .filter(Boolean)
                                .join(' / ')
                                .toLowerCase();
                            const name = String(x.name || '').toLowerCase();
                            const tail = want.includes(' / ') ? want.split(' / ').pop()?.trim() : want;
                            return label === want || name === want || (tail && (name === tail || String(x.option1 || '').toLowerCase() === tail));
                        });
                        if (v) {
                            livePrice = Number(v.price);
                            liveStock = Number(v.quantity ?? v.stock ?? liveStock);
                        }
                    }

                    if (!(livePrice > 0)) return item;
                    return {
                        ...item,
                        price: livePrice,
                        maxStock: Number.isFinite(liveStock) && liveStock >= 0 ? liveStock : item.maxStock,
                    };
                } catch {
                    return item;
                }
            })
        );

        const changed = next.some(
            (item, i) => item.price !== current[i].price || item.maxStock !== current[i].maxStock
        );
        if (!changed) return;
        cartRef.current = next;
        persistCart(next);
        setCart(next);
    }, []);

    // After hydrate, refresh sale prices so old carts don't keep pre-sale amounts
    useEffect(() => {
        if (!isHydrated || cartRef.current.length === 0) return;
        void syncCartPrices();
    }, [isHydrated, syncCartPrices]);

    const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
    const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

    return (
        <CartContext.Provider
            value={{
                cart,
                addToCart,
                removeFromCart,
                updateQuantity,
                clearCart,
                syncCartPrices,
                cartCount,
                subtotal,
                isCartOpen,
                setIsCartOpen,
                isHydrated,
            }}
        >
            {children}
        </CartContext.Provider>
    );
}

export function useCart() {
    const context = useContext(CartContext);
    if (context === undefined) {
        throw new Error('useCart must be used within a CartProvider');
    }
    return context;
}
