'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

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
    moq?: number; // Minimum Order Quantity
    /** True when the item is out of stock at purchase time and is being ordered as a preorder (produced on demand) */
    isPreorder?: boolean;
};

type CartContextType = {
    cart: CartItem[];
    addToCart: (item: CartItem) => void;
    removeFromCart: (itemId: string, variant?: string) => void;
    updateQuantity: (itemId: string, quantity: number, variant?: string) => void;
    clearCart: () => void;
    cartCount: number;
    subtotal: number;
    isCartOpen: boolean;
    setIsCartOpen: (isOpen: boolean) => void;
    /** False until localStorage has been read — avoid treating the cart as empty during hydration */
    isHydrated: boolean;
};

const CartContext = createContext<CartContextType | undefined>(undefined);

const CART_KEY = 'cart';

function isValidUUID(str: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

function persistCart(items: CartItem[]) {
    try {
        localStorage.setItem(CART_KEY, JSON.stringify(items));
        window.dispatchEvent(new Event('cartUpdated'));
    } catch {
        /* quota / private mode */
    }
}

function readStoredCart(): CartItem[] {
    try {
        const savedCart = localStorage.getItem(CART_KEY);
        if (!savedCart) return [];

        const parsed: CartItem[] = JSON.parse(savedCart);
        if (!Array.isArray(parsed)) return [];

        return parsed.filter((item) => {
            if (!item?.id || !item.name || item.price == null) return false;
            if (!isValidUUID(String(item.id))) {
                console.warn(`Removing legacy cart item with non-UUID id: ${item.id}`);
                return false;
            }
            if (!item.slug) {
                item.slug = item.id;
            }
            return true;
        });
    } catch (e) {
        console.error('Failed to parse cart:', e);
        try {
            localStorage.removeItem(CART_KEY);
        } catch {
            /* ignore */
        }
        return [];
    }
}

export function CartProvider({ children }: { children: ReactNode }) {
    const [cart, setCart] = useState<CartItem[]>([]);
    const [isCartOpen, setIsCartOpen] = useState(false);
    const [isHydrated, setIsHydrated] = useState(false);

    const handleSetCartOpen = (isOpen: boolean) => {
        setIsCartOpen(isOpen);
    };

    // Load cart from localStorage on mount
    useEffect(() => {
        const migratedCart = readStoredCart();
        setCart(migratedCart);
        // Keep storage in sync if migration removed items
        persistCart(migratedCart);
        setIsHydrated(true);
    }, []);

    const addToCart = (newItem: CartItem) => {
        setCart((prevCart) => {
            const existingItemIndex = prevCart.findIndex(
                (item) =>
                    item.id === newItem.id &&
                    item.variant === newItem.variant &&
                    (item.variantId || '') === (newItem.variantId || '')
            );

            let next: CartItem[];
            if (existingItemIndex > -1) {
                next = [...prevCart];
                const existingItem = next[existingItemIndex];
                const newQuantity = Math.min(
                    existingItem.quantity + newItem.quantity,
                    existingItem.maxStock
                );
                next[existingItemIndex] = { ...existingItem, quantity: newQuantity };
            } else {
                next = [...prevCart, newItem];
            }

            // Persist synchronously so Buy Now / hard navigations see the cart
            persistCart(next);
            return next;
        });

        setIsCartOpen(true);
    };

    const removeFromCart = (itemId: string, variant?: string) => {
        setCart((prevCart) => {
            const next = prevCart.filter(
                (item) => !(item.id === itemId && item.variant === variant)
            );
            persistCart(next);
            return next;
        });
    };

    const updateQuantity = (itemId: string, quantity: number, variant?: string) => {
        setCart((prevCart) => {
            const item = prevCart.find((i) => i.id === itemId && i.variant === variant);
            if (!item) return prevCart;

            const minQty = item.moq || 1;

            let next: CartItem[];
            if (quantity < minQty) {
                next = prevCart.filter((i) => !(i.id === itemId && i.variant === variant));
            } else {
                const clampedQty = Math.min(Math.max(quantity, minQty), item.maxStock);
                next = prevCart.map((i) =>
                    i.id === itemId && i.variant === variant
                        ? { ...i, quantity: clampedQty }
                        : i
                );
            }

            persistCart(next);
            return next;
        });
    };

    const clearCart = () => {
        persistCart([]);
        setCart([]);
    };

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
                cartCount,
                subtotal,
                isCartOpen,
                setIsCartOpen: handleSetCartOpen,
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
